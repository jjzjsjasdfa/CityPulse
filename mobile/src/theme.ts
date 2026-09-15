import type { EventCategory, EventStatus } from './api/types';

export const colors = {
  ink: '#173232',
  inkMuted: '#59706D',
  paper: '#F7F4EC',
  white: '#FFFDF8',
  line: '#DED9CC',
  orange: '#EF6A3A',
  yellow: '#F5C85B',
  mint: '#A9D7C9',
  green: '#2E756A',
  red: '#BB4A45',
};

export const categoryLabels: Record<EventCategory, string> = {
  performance: '演出',
  sports: '体育',
  exhibition: '展览',
  festival: '节庆',
  market: '市集',
  public_culture: '公共文化',
  pop_up: '限时体验',
  seasonal: '季节活动',
};

export const categoryColors: Record<EventCategory, string> = {
  performance: '#BC4436',
  sports: '#207564',
  exhibition: '#6956A7',
  festival: '#896208',
  market: '#A45524',
  public_culture: '#246C91',
  pop_up: '#A43F72',
  seasonal: '#586F24',
};

// Brighter signals remain distinct from the darker, readable map label palette.
export const signalColors: Record<EventCategory, string> = {
  performance: '#FF786B', sports: '#38DEBB', exhibition: '#AF91FF', festival: '#FFE165',
  market: '#FFAF69', public_culture: '#63CEFF', pop_up: '#FF86C5', seasonal: '#B5ED69',
};

export const statusLabels: Record<EventStatus, string> = {
  announced: '已官宣',
  on_sale: '可预约/购票',
  sold_out: '已售罄',
  postponed: '已延期',
  cancelled: '已取消',
  ended: '已结束',
};

export const formatDate = (value: string, includeTime = true) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(new Date(value));
