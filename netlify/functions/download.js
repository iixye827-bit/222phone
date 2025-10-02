// 文件路径: netlify/functions/download.js

const { createAppAuth } = require("@octokit/auth-app");
const { Octokit } = require("@octokit/rest");

// ***************************************************************
// ** 重要：请在这里修改为你自己的 GitHub 用户名和私有仓库名 **
// ***************************************************************
const GITHUB_OWNER = 'iixye827-bit'; // 例如：'john-doe'
const GITHUB_REPO = '111phone';   // 例如：'jellyfish-data-repo'
// ***************************************************************
// ***************************************************************

exports.handler = async function(event, context) {
  try {
    // 1. 从环境变量中读取我们的GitHub App凭证
    const appId = process.env.GITHUB_APP_ID;
    const clientId = process.env.GITHUB_CLIENT_ID;
    const privateKey = process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n'); // 修复Netlify对换行符的处理

    // 2. 使用凭证进行身份验证，获取一个临时的JWT (JSON Web Token)
    // 这是证明“我是这个GitHub App”的第一步
    const auth = createAppAuth({
      appId,
      privateKey,
      clientId,
    });
    
    const appAuthentication = await auth({ type: "app" });
    const appOctokit = new Octokit({ auth: appAuthentication.token });

    // 3. 找到我们的App安装在哪个仓库上，并获取那个仓库的 installationId
    const { data: installations } = await appOctokit.apps.listInstallations();
    const installation = installations.find(
      (inst) => inst.account.login === GITHUB_OWNER
    );

    if (!installation) {
      throw new Error(`在 ${GITHUB_OWNER} 上找不到该App的安装。请检查App是否已安装并授权给仓库。`);
    }
    const installationId = installation.id;

    // 4. 使用 installationId 获取一个针对该仓库的、有时效性的访问令牌 (token)
    // 这是第二步认证，有了这个令牌，我们才能真正操作那个私有仓库
    const installationAuthentication = await auth({
      type: "installation",
      installationId,
    });
    const installationOctokit = new Octokit({ auth: installationAuthentication.token });

    // 5. 使用这个最终的令牌，从私有仓库中获取 data.json 文件的内容
    const { data } = await installationOctokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: 'data.json',
    });

    // 6. GitHub API返回的内容是Base64编码的，我们需要把它解码成人类可读的字符串
    const content = Buffer.from(data.content, 'base64').toString('utf8');

    // 7. 将解码后的内容作为JSON返回给前端
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // 允许跨域访问
      },
      body: content,
    };

  } catch (error) {
    // 如果任何一步出错，打印错误日志并返回一个错误信息给前端
    console.error("云函数执行失败:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "从GitHub获取文件失败。",
        error: error.message,
      }),
    };
  }
};
