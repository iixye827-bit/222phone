const axios = require('axios');
const jwt = require('jsonwebtoken');

// 辅助函数：生成 GitHub App 的 JWT
function generateJwt() {
  const privateKey = process.env.GITHUB_PRIVATE_KEY;
  const appId = process.env.GITHUB_APP_ID;

  if (!privateKey || !appId) {
    throw new Error('GitHub App ID or Private Key not configured in environment variables.');
  }

  const payload = {
    iat: Math.floor(Date.now() / 1000) - 60,      // Issued at time, 60 seconds in the past
    exp: Math.floor(Date.now() / 1000) + (10 * 60), // Expiration time (10 minutes max)
    iss: appId                                      // Issuer: your app ID
  };

  return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
}

// Netlify 云函数的主处理程序
exports.handler = async (event) => {
  // 从请求的 URL 参数中获取 owner 和 repo
  const { owner, repo } = event.queryStringParameters;

  if (!owner || !repo) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing owner or repo query parameters.' }),
    };
  }

  try {
    const appToken = generateJwt();

    // 1. 使用 JWT 获取 App 在特定仓库上的 "installation ID"
    const installationResponse = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/installation`,
      {
        headers: {
          Authorization: `Bearer ${appToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );
    const installationId = installationResponse.data.id;

    // 2. 使用 installation ID 获取一个临时的、真正拥有权限的 access token
    const accessTokenResponse = await axios.post(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {},
      {
        headers: {
          Authorization: `Bearer ${appToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );
    const accessToken = accessTokenResponse.data.token;

    // 3. 使用这个 access token 去获取文件内容
    const fileResponse = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/contents/jellyfish.json`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );
    
    // GitHub API返回的内容是 Base64 编码的，需要解码
    const content = Buffer.from(fileResponse.data.content, 'base64').toString('utf-8');
    const jsonData = JSON.parse(content);

    // 成功！返回解码后的 JSON 数据
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // 允许跨域
      },
      body: JSON.stringify(jsonData),
    };

  } catch (error) {
    console.error('Error processing request:', error.message);
    // 返回一个有用的错误信息给前端
    return {
      statusCode: error.response?.status || 500,
      body: JSON.stringify({ 
          error: 'Failed to fetch data from GitHub.',
          details: error.response?.data?.message || 'Check server logs for more info.'
      }),
    };
  }
};
