export const enum SlotFlags {
  /**
   * Stable slots that only reference slot props or context state. The slot
   * can fully capture its own dependencies so when passed down the parent won't
   * need to force the child to update.
   *
   * 仅引用插槽道具或上下文状态的稳定插槽。插槽可以完全捕获其自身的依赖项，因此在传递时，父级不需要强制子级进行更新
   */
  STABLE = 1,
  /**
   * Slots that reference scope variables (v-for or an outer slot prop), or
   * has conditional structure (v-if, v-for). The parent will need to force
   * the child to update because the slot does not fully capture its dependencies.
   *
   * 引用范围变量（v-for或外部插槽属性）或具有条件结构（v-if、v-for）的插槽。父项需要强制子项更新，因为插槽没有完全捕获其依赖项
   */
  DYNAMIC = 2,
  /**
   * `<slot/>` being forwarded into a child component. Whether the parent needs
   * to update the child is dependent on what kind of slots the parent itself
   * received. This has to be refined at runtime, when the child's vnode
   * is being created (in `normalizeChildren`)
   *
   * `<slot>`正在转发到子组件中。父级是否需要更新子级取决于父级本身接收到的插槽类型。
   * 当创建子节点的vnode时（在“normalizeChildren”中），必须在运行时对其进行优化
   */
  FORWARDED = 3
}

/**
 * Dev only
 */
export const slotFlagsText = {
  [SlotFlags.STABLE]: 'STABLE',
  [SlotFlags.DYNAMIC]: 'DYNAMIC',
  [SlotFlags.FORWARDED]: 'FORWARDED'
}
