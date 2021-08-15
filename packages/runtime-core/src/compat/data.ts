import { isPlainObject } from '@vue/shared'
import { DeprecationTypes, warnDeprecation } from './compatConfig'

export function deepMergeData(to: any, from: any) {
  for (const key in from) {
    const toVal = to[key]
    const fromVal = from[key]
    // 如果目标属性都是普通对象
    if (key in to && isPlainObject(toVal) && isPlainObject(fromVal)) {
      __DEV__ && warnDeprecation(DeprecationTypes.OPTIONS_DATA_MERGE, null, key)
      // 递归调用
      deepMergeData(toVal, fromVal)
    } else {
      // 如果有在to不存在的属性，则从from复制
      to[key] = fromVal
    }
  }
  return to
}
