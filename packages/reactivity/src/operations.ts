// using literal strings instead of numbers so that it's easier to inspect
// debugger events

export const enum TrackOpTypes {
  // 获取值触发的track
  GET = 'get',
  // 判断key触发的track
  HAS = 'has',
  // 遍历触发的track
  ITERATE = 'iterate'
}

export const enum TriggerOpTypes {
  // 更新至触发的trigger
  SET = 'set',
  // 添加新值触发的trigger
  ADD = 'add',
  // 删除值触发的trigger
  DELETE = 'delete',
  // 清空触发的trigger
  CLEAR = 'clear'
}
