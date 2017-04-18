import React = require("react")
const classNames = require("classnames")
import bowser = require("bowser")

const DRAG_MIME = "x-react-draggable-tree-drag"

export
type Key = string | number

export
interface RowInfo<TItem> {
  item: TItem
  selected: boolean
  path: number[]
  visible: boolean
  visibleOffset: number
}

interface DropTarget<TItem> {
  type: "between" | "over"
  index: number
  dest: RowInfo<TItem>
  destIndex: number
  depth: number
}

export
interface TreeDelegate<TItem> {
  renderRow(info: RowInfo<TItem>): JSX.Element
  getChildren(item: TItem): TItem[]|undefined
  getDroppable(src: TItem, dst: TItem): boolean
  getKey(item: TItem): Key
  getCollapsed(item: TItem): boolean
  onMove: (src: RowInfo<TItem>[], dest: RowInfo<TItem>, destIndexBefore: number, destIndexAfter: number) => void
  onCopy: (src: RowInfo<TItem>[], dest: RowInfo<TItem>, destIndexBefore: number) => void
  onContextMenu?: (info: RowInfo<TItem>|undefined, ev: React.MouseEvent<Element>) => void
  onCollapsedChange: (info: RowInfo<TItem>, collapsed: boolean) => void
  onSelectedKeysChange: (selectedKeys: Set<Key>, selectedInfos: RowInfo<TItem>[]) => void
}

export
interface TreeProps<TItem> {
  root: TItem
  rowHeight: number
  indent?: number
  selectedKeys: Set<Key>
  delegate: TreeDelegate<TItem>
}

export
class Tree<TItem> extends React.Component<TreeProps<TItem>, {}> {
  private element: HTMLElement
  private dropIndicator: DropIndicator
  private infoToPath = new Map<RowInfo<TItem>, number[]>()
  private pathToInfo = new Map<string, RowInfo<TItem>>() // using joined path as key string
  private visibleInfos: RowInfo<TItem>[] = []
  private keyToInfo = new Map<Key, RowInfo<TItem>>()
  private rootInfo: RowInfo<TItem>

  private removeAncestorsFromSelection(selection: Set<Key>) {
    const newSelection = new Set(selection)
    const {delegate} = this.props
    for (const {path} of this.keysToInfos(selection)) {
      for (let i = 1; i < path.length; ++i) {
        const subpath = path.slice(0, i)
        const ancestor = this.pathToInfo.get(subpath.join())
        if (ancestor) {
          newSelection.delete(delegate.getKey(ancestor.item))
        }
      }
    }
    return newSelection
  }

  private propsWithDefaults() {
    return Object.assign({}, {
      indent: 24,
    }, this.props)
  }

  private clearNodes() {
    this.visibleInfos = []
    this.pathToInfo.clear()
    this.infoToPath.clear()
    this.keyToInfo.clear()
  }

  private addRowInfo(rowInfo: RowInfo<TItem>) {
    const {delegate} = this.props
    this.infoToPath.set(rowInfo, rowInfo.path)
    this.pathToInfo.set(rowInfo.path.join(), rowInfo)
    if (rowInfo.visible) {
      this.visibleInfos.push(rowInfo)
    }
    this.keyToInfo.set(delegate.getKey(rowInfo.item), rowInfo)
  }

  private renderItem(item: TItem, path: number[], visible: boolean): JSX.Element[] {
    const {indent, rowHeight, delegate, selectedKeys} = this.propsWithDefaults()
    const key = delegate.getKey(item)

    const isSelected = selectedKeys.has(key)
    const rowInfo = {
      item,
      selected: isSelected,
      path,
      visible,
      visibleOffset: this.visibleInfos.length
    }
    this.addRowInfo(rowInfo)

    const style = {
      paddingLeft: (path.length - 1) * indent + "px",
      height: rowHeight + "px",
    }

    const onDragStart = (ev: React.DragEvent<Element>) => {
      ev.dataTransfer.effectAllowed = "copyMove"
      ev.dataTransfer.setData(DRAG_MIME, "drag")

      if (!selectedKeys.has(key)) {
        const newSelected = new Set([key])
        delegate.onSelectedKeysChange(newSelected, this.keysToInfos(newSelected))
      }
    }

    const onDragEnd = () => {
      this.updateDropIndicator(undefined)
    }

    const onTogglerClick = () => {
      if (delegate.getChildren(item)) {
        delegate.onCollapsedChange(rowInfo, !delegate.getCollapsed(item))
      }
    }

    const rowClasses = classNames("ReactDraggableTree_row", {
      "ReactDraggableTree_row-selected": isSelected,
    })

    const children = delegate.getChildren(item)
    const collapsed = delegate.getCollapsed(item)

    let row = (
      <div
        key={`row-${key}`} className={rowClasses} style={style}
        onClick={ev => this.onClickRow(rowInfo, ev)}
        draggable={true} onDragStart={onDragStart} onDragEnd={onDragEnd}
      >
        <Toggler visible={!!children} collapsed={collapsed} onClick={onTogglerClick} />
        {delegate.renderRow(rowInfo)}
      </div>
    )

    if (children) {
      const childrenVisible = visible && !collapsed
      const childRows = <div key={`children-${key}`} className="ReactDraggableTree_children" hidden={collapsed}>
        {children.map((child, i) => this.renderItem(child, [...path, i], childrenVisible))}
      </div>
      return [row, childRows]
    } else {
      return [row]
    }
  }

  private keysToInfos(keys: Set<Key>) {
    const infos: RowInfo<TItem>[] = []
    keys.forEach(key => {
      const info = this.keyToInfo.get(key)
      if (info) {
        infos.push(info)
      }
    })
    infos.sort((a, b) => comparePaths(a.path, b.path))
    return infos
  }

  private updateDropIndicator(target: DropTarget<TItem>|undefined) {
    if (target) {
      const {type, index, depth} = target
      this.dropIndicator.setState({type, index, depth})
    } else {
      this.dropIndicator.setState({type: "none", index: 0, depth: 0})
    }
  }

  render() {
    const {root, rowHeight, indent, delegate} = this.propsWithDefaults()
    const children = delegate.getChildren(root) || []
    this.clearNodes()
    const rootInfo = {item: root, selected: false, current: false, path: [], visible: false, visibleOffset: 0}
    this.addRowInfo(rootInfo)
    this.rootInfo = rootInfo

    return (
      <div ref={e => this.element = e} className="ReactDraggableTree" onDragOver={this.onDragOver} onDrop={this.onDrop} onContextMenu={this.onContextMenu}>
        {children.map((child, i) => this.renderItem(child, [i], true))}
        <DropIndicator ref={e => this.dropIndicator = e} rowHeight={rowHeight} indent={indent} />
      </div>
    )
  }

  private onClickRow = (rowInfo: RowInfo<TItem>, ev: React.MouseEvent<Element>) => {
    const {selectedKeys, delegate} = this.props
    const key = delegate.getKey(rowInfo.item)
    let newSelected: Set<Key>
    if (ev.ctrlKey || ev.metaKey) {
      newSelected = new Set(selectedKeys)
      if (newSelected.has(key)) {
        newSelected.delete(key)
      } else {
        newSelected.add(key)
      }
    } else if (ev.shiftKey && selectedKeys.size > 0) {
      const visibleKeys = this.visibleInfos.map(info => delegate.getKey(info.item))
      const selectedIndices = this.keysToInfos(selectedKeys).map(info => info.visibleOffset)
      const thisIndex = visibleKeys.indexOf(key)
      const min = Math.min(thisIndex, ...selectedIndices)
      const max = Math.max(thisIndex, ...selectedIndices)
      const keysToAdd = visibleKeys.slice(min, max + 1)
      newSelected = new Set(selectedKeys)
      for (const k of keysToAdd) {
        newSelected.add(k)
      }
    } else {
      newSelected = new Set([key])
    }
    newSelected = this.removeAncestorsFromSelection(newSelected)

    delegate.onSelectedKeysChange(newSelected, this.keysToInfos(newSelected))
  }

  private onContextMenu = (ev: React.MouseEvent<Element>) => {
    const {rowHeight, delegate, selectedKeys} = this.props
    const {visibleInfos} = this
    const rect = this.element.getBoundingClientRect()
    const y = ev.clientY - rect.top + this.element.scrollTop
    const i = Math.floor(y / rowHeight)
    const rowInfo = (0 <= i && i < visibleInfos.length) ? visibleInfos[i] : undefined
    if (rowInfo && !selectedKeys.has(delegate.getKey(rowInfo.item))) {
      this.onClickRow(rowInfo, ev)
    }
    if (delegate.onContextMenu) {
      delegate.onContextMenu(rowInfo, ev)
    }
  }

  private onDragOver = (ev: React.DragEvent<Element>) => {
    ev.preventDefault()
    const copy = ev.altKey || ev.ctrlKey
    ev.dataTransfer.dropEffect = copy ? "copy" : "move"
    const target = this.getDropTarget(ev)
    if (this.canDrop(target.dest, target.destIndex)) {
      this.updateDropIndicator(target)
      return
    }
    this.updateDropIndicator(undefined)
  }

  private getDropTarget(ev: {clientX: number, clientY: number}): DropTarget<TItem> {
    const {delegate} = this.props
    const {rowHeight, indent} = this.propsWithDefaults()
    const rect = this.element.getBoundingClientRect()
    const x = ev.clientX - rect.left + this.element.scrollLeft
    const y = ev.clientY - rect.top + this.element.scrollTop
    const overIndex = clamp(Math.floor(y / rowHeight), 0, this.visibleInfos.length)
    const offset = y - overIndex * rowHeight

    if (overIndex < this.visibleInfos.length) {
      if (rowHeight * 0.25 < offset && offset < rowHeight * 0.75) {
        const dest = this.visibleInfos[overIndex]
        if (delegate.getChildren(dest.item)) {
          return {
            type: "over",
            index: overIndex,
            dest,
            destIndex: 0,
            depth: 0,
          }
        }
      }
    }

    const betweenIndex = clamp((offset < rowHeight / 2) ? overIndex : overIndex + 1, 0, this.visibleInfos.length)

    let path = (betweenIndex == this.visibleInfos.length)
      ? [delegate.getChildren(this.rootInfo.item)!.length]
      : this.visibleInfos[betweenIndex].path
    if (0 < betweenIndex) {
      const prev = this.visibleInfos[betweenIndex - 1]
      let prevPath = prev.path
      const prevChildren = delegate.getChildren(prev.item)
      const prevCollapsed = delegate.getCollapsed(prev.item)
      if (prevChildren && prevChildren.length == 0 && !prevCollapsed) {
        prevPath = [...prevPath, -1]
      }
      if (path.length < prevPath.length) {
        const depth = clamp(Math.floor(x / indent) - 1, path.length, prevPath.length)
        path = [...prevPath.slice(0, depth - 1), prevPath[depth - 1] + 1]
      }
    }
    const destPath = path.slice(0, -1)
    const dest = this.pathToInfo.get(destPath.join())!
    return {
      type: "between",
      index: betweenIndex,
      dest,
      destIndex: path[path.length - 1],
      depth: path.length - 1
    }
  }

  private canDrop(destInfo: RowInfo<TItem>, destIndex: number) {
    const {selectedKeys, delegate} = this.props
    const {path} = destInfo
    for (let i = 0; i < path.length; ++i) {
      const ancestorPath = path.slice(0, path.length - i)
      const ancestor = this.pathToInfo.get(ancestorPath.join())
      if (ancestor) {
        const ancestorKey = delegate.getKey(ancestor.item)
        if (selectedKeys.has(ancestorKey)) {
          return false
        }
      }
    }
    return true
  }

  private onDrop = (ev: React.DragEvent<Element>) => {
    const {delegate} = this.props

    this.updateDropIndicator(undefined)

    const data = ev.dataTransfer.getData(DRAG_MIME)
    if (!data) {
      return
    }
    // workaround for https://bugs.chromium.org/p/chromium/issues/detail?id=644421
    let {clientX, clientY} = ev
    if (bowser.windows && bowser.chrome && bowser.version == "53.0") {
      clientX *= window.devicePixelRatio
      clientY *= window.devicePixelRatio
    }

    const target = this.getDropTarget({clientX, clientY})
    const {dest: destInfo, destIndex} = target

    if (!this.canDrop(destInfo, destIndex)) {
      return
    }
    const srcInfos = this.keysToInfos(this.props.selectedKeys)

    const copy = ev.altKey || ev.ctrlKey

    if (copy) {
      delegate.onCopy(srcInfos, destInfo, destIndex)
    } else {
      let destIndexAfter = destIndex
      for (let info of srcInfos) {
        if (isPathEqual(info.path.slice(0, -1), destInfo.path)) {
          const srcIndex = info.path[info.path.length - 1]
          if (srcIndex < destIndex) {
            destIndexAfter--
          }
        }
      }
      delegate.onMove(srcInfos, destInfo, destIndex, destIndexAfter)
    }
    ev.preventDefault()
  }
}

function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(x, max))
}

function comparePaths(a: number[], b: number[]) {
  for (let i = 0; true; ++i) {
    if (a.length == i && b.length == i) {
      return 0
    }
    if (a.length == i || a[i] < b[i]) {
      return -1
    }
    if (b.length == i || b[i] < a[i]) {
      return 1
    }
  }
}

function isPathEqual(a: number[], b: number[]) {
  if (a.length != b.length) {
    return
  }
  for (let i = 0; i < a.length; ++i) {
    if (a[i] != b[i]) {
      return false
    }
  }
  return true
}

interface TogglerProps {
  visible: boolean
  collapsed: boolean
  onClick: () => void
}

function Toggler(props: TogglerProps) {
  const claassName = classNames("ReactDraggableTree_toggler", {
    "ReactDraggableTree_toggler-visible": props.visible,
    "ReactDraggableTree_toggler-collapsed": props.collapsed,
  })
  return <div className={claassName} onClick={props.onClick}/>
}

interface DropIndicatorProps {
  rowHeight: number
  indent: number
}

interface DropIndicatorState {
  type: "none" | "over" | "between"
  index: number
  depth: number
}

class DropIndicator extends React.Component<DropIndicatorProps, DropIndicatorState> {
  state: DropIndicatorState = {
    type: "none",
    index: 0,
    depth: 0,
  }

  render() {
    const {type, index, depth} = this.state
    const {rowHeight, indent} = this.props
    const offset = index * rowHeight
    const dropOverStyle = {
      top: `${offset}px`,
      height: `${rowHeight}px`,
    }
    const dropBetweenStyle = {
      top: `${offset - 1}px`,
      height: "2px",
      left: `${(depth + 1) * indent}px`,
      width: `calc(100% - ${(depth + 1) * indent}px)`
    }
    return (
      <div>
        <div className="ReactDraggableTree_dropOver" hidden={type != "over"} style={dropOverStyle} />
        <div className="ReactDraggableTree_dropBetween" hidden={type != "between"} style={dropBetweenStyle} />
      </div>
    )
  }
}
