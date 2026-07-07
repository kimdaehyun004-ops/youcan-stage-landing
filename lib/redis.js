const { Redis } = require('@upstash/redis');

let client;

function getRedis() {
  if (!client) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 환경변수가 설정되어 있지 않습니다.');
    }
    client = new Redis({ url, token });
  }
  return client;
}

module.exports = { getRedis };
