import axios from 'axios'
import path from 'path'
import parsePhoneNumber from 'libphonenumber-js'
import { promises } from 'fs'
const { readFile, writeFile } = promises

const CONFIG_DIR = path.join(__dirname, 'config')

/**
 * @description: 获取api
 */
const getLocalApi = async () => {
  let api
  try {
    const content = await readFile(`${CONFIG_DIR}/api`, 'utf-8')
    api = content.split('\n')[0]
  } catch (error) {
    api = 'https://api.littlecontrol.me'
  }
  return api
}

/**
 * @description: 拦截请求,添加cookie等信息
 */
axios.interceptors.request.use(
  async (config) => {
    config.withCredentials = true

    /**
     * @description: 防止网易对IP的限制
     */
    config.headers['X-Real-IP'] = '123.138.78.143'
    const { method, url } = config
    config.params ??= {}
    if (method?.toUpperCase() === 'POST') {
      config.params.timestamp = Date.now()
      config.params.realIP = '123.138.78.143'
    }
    if (url?.includes('/login')) {
      return config
    }
    const COOKIE = await getCookie()
    config.data ??= {}
    config.data.cookie = COOKIE
    return config
  },
  async (error) => {
    return Promise.reject(error)
  }
)

/**
 * @description: 从文件读取账户信息
 */
const getAccountInfo = async () => {
  const res = await readFile(`${CONFIG_DIR}/account`, 'utf-8')
  const resArr = res.split('\n')
  const parsedNumber = parsePhoneNumber(resArr[0], 'CN')
  const phone = parsedNumber?.formatNational().replace(/[()\s-]/g, '')
  const countrycode = parsedNumber?.countryCallingCode
  return {
    phone,
    countrycode,
    password: resArr[1],
  }
}

/**
 * @description: 通过手机号登陆,以获取Cookie
 */
const loginByPhone = async () => {
  let res
  const api = await getLocalApi()
  const url = `${api}/login/cellphone`
  const accountInfo = await getAccountInfo()
  const { data } = await axios({
    method: 'POST',
    url,
    data: accountInfo,
  })
  res = data?.cookie ?? ''
  return res
}

/**
 * @description: 获取Cookie
 */

const getCookie = async () => {
  const localCookie = await readFile(`${CONFIG_DIR}/cookie`, 'utf8')
  const { data } = await getLoginStatus(localCookie)
  if (data.account && data.profile) {
    return localCookie
  } else {
    const COOKIE = await loginByPhone()
    await writeFile(`${CONFIG_DIR}/cookie`, COOKIE)
    return COOKIE
  }
}

/**
 * @description: 获取用户登陆状态
 */
const getLoginStatus = async (cookie) => {
  const api = await getLocalApi()
  const url = `${api}/login/status`
  const res = await axios({
    method: 'POST',
    url,
    data: {
      cookie,
    },
  })
  return res.data
}

/**
 * @description: 获取用户等级相关信息
 */
const getUserLevelInfo = async (api) => {
  const url = `${api}/user/level`
  const { data } = await axios({
    method: 'POST',
    url,
  })
  return data
}

/**
 * @description: 打卡签到
 */
const checkIn = async (api) => {
  const url = `${api}/daily_signin`
  let res
  res = await axios({
    method: 'POST',
    url,
  })
  console.log('Android端签到完成')
  res = await axios({
    method: 'POST',
    url,
    params: {
      type: 1,
    },
  })
  console.log('Web/PC端签到完成')
  return res.data ?? res
}

/**
 * @description: 获取每日推荐歌单
 */
const getDailyPlaylist = async (api) => {
  const url = `${api}/recommend/resource`
  const { data } = await axios({
    method: 'POST',
    url,
  })
  return data
}

/**
 * @description: 获取歌单详情
 */
const getPlaylistContent = async (id, api) => {
  const url = `${api}/playlist/detail`
  const { data } = await axios({
    method: 'POST',
    url,
    params: {
      id,
    },
  })
  return data
}

/**
 * @description: 根据每日歌单推荐刷播放量
 */
const playDailyLists = async (api) => {
  const url = `${api}/scrobble`
  const { recommend } = await getDailyPlaylist(api)
  let res
  recommend.forEach(async (item) => {
    const { privileges } = await getPlaylistContent(item.id, api)
    privileges.forEach(async (song) => {
      res = await axios({
        method: 'POST',
        url,
        params: {
          id: song.id,
          sourceid: item.id,
          time: 1000,
        },
      })
    })
  })
  console.log('每日推荐歌单完成')
  return res
}

/**
 * @description: 获取每日推荐歌曲
 */
const getDailySongs = async (api) => {
  const url = `${api}/recommend/songs`
  const { data } = await axios({
    method: 'POST',
    url,
  })
  return data.data
}

/**
 * @description: 听歌打卡, 根据每日推荐刷听歌量
 */
const playDailySongs = async (api) => {
  const url = `${api}/scrobble`
  const { dailySongs } = await getDailySongs(api)
  let res
  dailySongs.forEach(async (song) => {
    res = await axios({
      method: 'POST',
      url,
      params: {
        id: song.id,
        sourceid: song.al.id,
        time: 500,
      },
    })
  })
  console.log('每日推荐歌曲完成')
  return res
}

/**
 * @description: 云贝签到
 */
const checkInYunbei = async (api) => {
  const url = `${api}/yunbei/sign`
  let res
  res = await axios({
    method: 'POST',
    url,
  })
  console.log('云贝签到完成')
  return res
}

export const main = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false
  let res = []
  try {
    const api = await getLocalApi()
    res.push(await playDailySongs(api))
    res.push(await playDailyLists(api))
    res.push(await checkIn(api))
    res.push(await checkInYunbei(api))
  } catch (error) {
    res.push(error?.response?.data)
  }
  callback(null, res)
}
