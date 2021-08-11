import {
  reactive,
  readonly,
  toRaw,
  ReactiveFlags,
  Target,
  readonlyMap,
  reactiveMap,
  shallowReactiveMap,
  shallowReadonlyMap
} from './reactive'
import { TrackOpTypes, TriggerOpTypes } from './operations'
import {
  track,
  trigger,
  ITERATE_KEY,
  pauseTracking,
  resetTracking
} from './effect'
import {
  isObject,
  hasOwn,
  isSymbol,
  hasChanged,
  isArray,
  isIntegerKey,
  extend,
  makeMap
} from '@vue/shared'
import { isRef } from './ref'

// 不需要追踪的属性
const isNonTrackableKeys = /*#__PURE__*/ makeMap(`__proto__,__v_isRef,__isVue`)

const builtInSymbols = new Set(
  Object.getOwnPropertyNames(Symbol)
    // 把Symbol所有key的值存入一个Set中
    .map(key => (Symbol as any)[key])
    // 再过滤出值里面类型是symbol的值，避免递归
    .filter(isSymbol)
)

// 普通getter
const get = /*#__PURE__*/ createGetter()
// 浅表getter
const shallowGet = /*#__PURE__*/ createGetter(false, true)
// 只读getter
const readonlyGet = /*#__PURE__*/ createGetter(true)
// 浅表只读getter
const shallowReadonlyGet = /*#__PURE__*/ createGetter(true, true)
// Array重写的方法对象
const arrayInstrumentations = /*#__PURE__*/ createArrayInstrumentations()

function createArrayInstrumentations() {
  const instrumentations: Record<string, Function> = {}
  // instrument identity-sensitive Array methods to account for possible reactive
  // values
  ;(['includes', 'indexOf', 'lastIndexOf'] as const).forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      // 原始数组对象
      const arr = toRaw(this) as any
      for (let i = 0, l = this.length; i < l; i++) {
        // 添加追踪
        track(arr, TrackOpTypes.GET, i + '')
      }
      // we run the method using the original args first (which may be reactive)
      // 首先使用原始数组对象的方法
      const res = arr[key](...args)
      if (res === -1 || res === false) {
        // if that didn't work, run it again using raw values.
        // 如果无效，则取出数组元素的原始对象再进行一次
        return arr[key](...args.map(toRaw))
      } else {
        return res
      }
    }
  })
  // instrument length-altering mutation methods to avoid length being tracked
  // which leads to infinite loops in some cases (#2137)
  ;(['push', 'pop', 'shift', 'unshift', 'splice'] as const).forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      // 暂停追踪
      pauseTracking()
      // 取出原始数据
      const res = (toRaw(this) as any)[key].apply(this, args)
      // 开始追踪
      resetTracking()
      return res
    }
  })
  return instrumentations
}

function createGetter(isReadonly = false, shallow = false) {
  return function get(target: Target, key: string | symbol, receiver: object) {
    // 如果key是响应式的几个属性
    if (key === ReactiveFlags.IS_REACTIVE) {
      return !isReadonly
    } else if (key === ReactiveFlags.IS_READONLY) {
      return isReadonly
    } else if (
      // 获取原始对象
      key === ReactiveFlags.RAW &&
      receiver ===
        (isReadonly
          ? shallow
            ? shallowReadonlyMap
            : readonlyMap
          : shallow
          ? shallowReactiveMap
          : reactiveMap
        ).get(target)
    ) {
      return target
    }

    // 是否是数组
    const targetIsArray = isArray(target)

    // 非只读，且是数组，并且要访问的方法存在重写
    if (!isReadonly && targetIsArray && hasOwn(arrayInstrumentations, key)) {
      return Reflect.get(arrayInstrumentations, key, receiver)
    }

    const res = Reflect.get(target, key, receiver)

    // 如果是Symbol，且key是symbol类型
    // 或者是不需要追踪的key
    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      // 直接返回
      return res
    }

    // 非只读，追踪依赖项
    if (!isReadonly) {
      track(target, TrackOpTypes.GET, key)
    }

    // 如果只是浅表的
    if (shallow) {
      return res
    }

    // 是ref对象
    if (isRef(res)) {
      // ref unwrapping - does not apply for Array + integer key.
      // 如果是数组且是整型的key，直接返回数值，不用解包
      // 如果不是数组或者不是整型key，则需要解包
      const shouldUnwrap = !targetIsArray || !isIntegerKey(key)
      return shouldUnwrap ? res.value : res
    }

    // 是普通object
    if (isObject(res)) {
      // Convert returned value into a proxy as well. we do the isObject check
      // here to avoid invalid value warning. Also need to lazy access readonly
      // and reactive here to avoid circular dependency.
      // 将返回值变为响应式
      // 递归处理，当reactive对象是深层次时
      return isReadonly ? readonly(res) : reactive(res)
    }

    return res
  }
}

const set = /*#__PURE__*/ createSetter()
const shallowSet = /*#__PURE__*/ createSetter(true)

function createSetter(shallow = false) {
  return function set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: object
  ): boolean {
    // 旧值
    let oldValue = (target as any)[key]
    // 如果不是浅表
    if (!shallow) {
      // 求出新值和旧值的raw
      value = toRaw(value)
      oldValue = toRaw(oldValue)
      // 如果不是数组，且旧值是ref对象，且新值不是ref对象
      if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
        // 直接更新旧值
        oldValue.value = value
        return true
      }
    } else {
      // in shallow mode, objects are set as-is regardless of reactive or not
      // 在浅层模式下，无论是否反应，对象都按原样设置
    }

    // 是数组且是整型key，且整型key小于数组长度
    // 非数组就判断源数据有没有对应的key
    const hadKey =
      isArray(target) && isIntegerKey(key)
        ? Number(key) < target.length
        : hasOwn(target, key)
    const result = Reflect.set(target, key, value, receiver)
    // don't trigger if target is something up in the prototype chain of original
    // 如果 target 是源数据原型链中的某个东西，则不要触发
    // 如果target等于receiver的源数据对象，则触发更新
    if (target === toRaw(receiver)) {
      // 如果不存在这个key
      if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, key, value)
      } else if (hasChanged(value, oldValue)) {
        // 如果有更改
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
    }
    return result
  }
}

function deleteProperty(target: object, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = (target as any)[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }
  return result
}

function has(target: object, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  if (!isSymbol(key) || !builtInSymbols.has(key)) {
    track(target, TrackOpTypes.HAS, key)
  }
  return result
}

function ownKeys(target: object): (string | symbol)[] {
  track(target, TrackOpTypes.ITERATE, isArray(target) ? 'length' : ITERATE_KEY)
  return Reflect.ownKeys(target)
}

export const mutableHandlers: ProxyHandler<object> = {
  get,
  set,
  deleteProperty,
  has,
  ownKeys
}

export const readonlyHandlers: ProxyHandler<object> = {
  get: readonlyGet,
  set(target, key) {
    if (__DEV__) {
      console.warn(
        `Set operation on key "${String(key)}" failed: target is readonly.`,
        target
      )
    }
    return true
  },
  deleteProperty(target, key) {
    if (__DEV__) {
      console.warn(
        `Delete operation on key "${String(key)}" failed: target is readonly.`,
        target
      )
    }
    return true
  }
}

export const shallowReactiveHandlers = /*#__PURE__*/ extend(
  {},
  mutableHandlers,
  {
    get: shallowGet,
    set: shallowSet
  }
)

// Props handlers are special in the sense that it should not unwrap top-level
// refs (in order to allow refs to be explicitly passed down), but should
// retain the reactivity of the normal readonly object.
export const shallowReadonlyHandlers = /*#__PURE__*/ extend(
  {},
  readonlyHandlers,
  {
    get: shallowReadonlyGet
  }
)
