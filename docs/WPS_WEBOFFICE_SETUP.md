# WPS WebOffice 页内预览配置

移动端文件预览已接入 WPS WebOffice JSSDK。WPS 的 `AppId`、`AppSecret` 和回调服务必须由服务端配置，密钥不会进入移动端构建产物。

## 1. 准备 JSSDK

从 [WPS WebOffice JSSDK 下载页](https://open.wps.cn/documents/app-integration-dev/docs-center/online-preview-edit/web/jssdk) 下载稳定版 JSSDK，解压其中的 `web-office-sdk-solution.umd.js` 到：

```text
frontend/mobile/public/vendor/wps/web-office-sdk-solution.umd.js
```

也可以通过 `WPS_WEBOFFICE_SDK_URL` 指向已部署的同名 UMD 脚本。

## 2. 配置后端环境变量

```text
WPS_WEBOFFICE_ENABLED=true
WPS_WEBOFFICE_APP_ID=你的 WPS AppId
WPS_WEBOFFICE_APP_SECRET=你的 WPS AppSecret
WPS_WEBOFFICE_PUBLIC_BASE_URL=https://你的公网域名
WPS_WEBOFFICE_TOKEN_SECRET=一段独立的随机长密钥
WPS_WEBOFFICE_VERIFY_SIGNATURE=true
WPS_WEBOFFICE_SDK_URL=/vendor/wps/web-office-sdk-solution.umd.js
```

`WPS_WEBOFFICE_PUBLIC_BASE_URL` 必须能被 WPS 服务集群访问，不能填 `localhost`、内网 IP 或仅移动端可访问的地址。

## 3. 配置 WPS 回调网关

在 WPS 应用的在线预览编辑回调配置中，将回调网关设置为：

```text
https://你的公网域名/api/v1/wps/weboffice
```

并开启文档预览所需的文件信息、下载地址、权限回调。服务端已经实现：

```text
GET /v3/3rd/files/{file_id}
GET /v3/3rd/files/{file_id}/download
GET /v3/3rd/files/{file_id}/permission
```

生产环境应保持 `WPS_WEBOFFICE_VERIFY_SIGNATURE=true`。没有完成 WPS 应用审核或配置时，移动端会退回原有 PDF/下载/外部应用打开方式。
