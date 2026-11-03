# 从 Mac 上传本包

压缩包与校验文件在本地项目的 `deployment-bundles/`。
下面两条命令在 **Mac 终端** 执行，不是在服务器终端执行。

```bash
ssh root@106.53.116.51 'install -d -m 700 /root/admeta-upload'
```

```bash
scp -p \
  /Users/x-ray/Desktop/ad-meta/deployment-bundles/admeta-deploy-20261026.tar.gz \
  /Users/x-ray/Desktop/ad-meta/deployment-bundles/admeta-deploy-20261026.tar.gz.sha256 \
  root@106.53.116.51:/root/admeta-upload/
```

输入当前服务器密码即可，输入时不会显示字符；不必将密码发送给本机或服务器 AI。
如果该 IP 已变化，以腾讯云实例实际公网 IP 为准。
不要上传到网站公开目录，也不要使用公开网盘链接作为科研数据包的默认分发方式。

上传完，把根目录 `SERVER_AI_DEPLOY.md` 的内容交给服务器 AI。
也可以先发这段启动指令：

> 部署包已上传到 /root/admeta-upload/admeta-deploy-20261026.tar.gz，同目录有 .sha256 文件。
> 请先执行 sha256sum -c 校验，解压到新的私有目录 /root/admeta-unpack/，
> 然后读取解压包根目录的 SERVER_AI_DEPLOY.md、README.md、KNOWN_LIMITATIONS.md，按其中任务完成部署。
> 使用新应用目录 /www/wwwroot/ad-meta，保留现有宝塔、DSH、SSH 服务。
> 本包带真实 MySQL 备份和完整当前运行数据，不要重新 bootstrap 或重导入科研数据。
