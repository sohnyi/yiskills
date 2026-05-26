'use strict';

/**
 * lib/constants.js — Apple App Store 常量
 * 来源：app-store-scraper / iTunes Store 公开文档
 */

const COLLECTION = {
  TOP_MAC          : 'topmacapps',
  TOP_FREE_MAC     : 'topfreemacapps',
  TOP_GROSSING_MAC : 'topgrossingmacapps',
  TOP_PAID_MAC     : 'toppaidmacapps',
  NEW_IOS          : 'newapplications',
  NEW_FREE_IOS     : 'newfreeapplications',
  NEW_PAID_IOS     : 'newpaidapplications',
  TOP_FREE_IOS     : 'topfreeapplications',
  TOP_FREE_IPAD    : 'topfreeipadapplications',
  TOP_GROSSING_IOS : 'topgrossingapplications',
  TOP_GROSSING_IPAD: 'topgrossingipadapplications',
  TOP_PAID_IOS     : 'toppaidapplications',
  TOP_PAID_IPAD    : 'toppaidipadapplications',
};

const CATEGORY = {
  BOOKS                  : 6018, BUSINESS               : 6000,
  CATALOGS               : 6022, EDUCATION              : 6017,
  ENTERTAINMENT          : 6016, FINANCE                : 6015,
  FOOD_AND_DRINK         : 6023, GAMES                  : 6014,
  GAMES_ACTION           : 7001, GAMES_ADVENTURE        : 7002,
  GAMES_ARCADE           : 7003, GAMES_BOARD            : 7004,
  GAMES_CARD             : 7005, GAMES_CASINO           : 7006,
  GAMES_DICE             : 7007, GAMES_EDUCATIONAL      : 7008,
  GAMES_FAMILY           : 7009, GAMES_MUSIC            : 7011,
  GAMES_PUZZLE           : 7012, GAMES_RACING           : 7013,
  GAMES_ROLE_PLAYING     : 7014, GAMES_SIMULATION       : 7015,
  GAMES_SPORTS           : 7016, GAMES_STRATEGY         : 7017,
  GAMES_TRIVIA           : 7018, GAMES_WORD             : 7019,
  HEALTH_AND_FITNESS     : 6013, LIFESTYLE              : 6012,
  MAGAZINES_AND_NEWSPAPERS: 6021,MEDICAL                : 6020,
  MUSIC                  : 6011, NAVIGATION             : 6010,
  NEWS                   : 6009, PHOTO_AND_VIDEO        : 6008,
  PRODUCTIVITY           : 6007, REFERENCE              : 6006,
  SHOPPING               : 6024, SOCIAL_NETWORKING      : 6005,
  SPORTS                 : 6004, TRAVEL                 : 6003,
  UTILITIES              : 6002, WEATHER                : 6001,
};

const SORT = {
  RECENT  : 'mostRecent',
  HELPFUL : 'mostHelpful',
};

/** iTunes Store-front ID 映射（主要市场） */
const MARKETS = {
  AU: 143460, AT: 143445, BE: 143446, BR: 143503, CA: 143455,
  CN: 143465, HR: 143494, CZ: 143489, DK: 143458, FI: 143447,
  FR: 143442, DE: 143443, GR: 143448, HK: 143463, HU: 143482,
  IN: 143467, ID: 143476, IE: 143449, IL: 143491, IT: 143450,
  JP: 143462, KR: 143466, LU: 143451, MY: 143473, MX: 143468,
  NL: 143452, NZ: 143461, NO: 143457, PH: 143474, PL: 143478,
  PT: 143453, RU: 143469, SA: 143479, SG: 143464, ZA: 143472,
  ES: 143454, SE: 143456, CH: 143459, TW: 143470, TH: 143475,
  TR: 143480, AE: 143481, US: 143441, GB: 143444, VN: 143471,
};

/** 将两位国家代码转换为 iTunes Store-front 数字 ID */
function storeId (country) {
  return (country && MARKETS[country.toUpperCase()]) || 143441;
}

module.exports = { COLLECTION, CATEGORY, SORT, MARKETS, storeId };