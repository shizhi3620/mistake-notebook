# 01 WeChat Login Smoke Test

Run this checklist only against the controlled beta environment with a registered HTTPS API domain and a test WeChat account. Use fictional child data.

- [ ] Configure `WECHAT_APP_ID` and `WECHAT_APP_SECRET` in the service environment.
- [ ] Generate the ignored mini-program configuration with registered HTTPS API domains.
- [ ] Enable URL validation in WeChat Developer Tools and verify the configured domain is accepted.
- [ ] Upload the beta build with the authorized AppID and open it on a physical device.
- [ ] Confirm first login creates an unconfirmed guardian account without exposing the WeChat code or platform identity.
- [ ] Confirm a relaunch issues a new session and restores the same guardian account.
- [ ] Confirm an expired session prompts login again and cannot read the home view before renewal.
- [ ] Record date, tester, build version, target environment and outcome in the release log. Do not record login codes, tokens or child data.
