<img height="100" src="https://cdn.segra.tv/icon.png"/>

**Segra** is a powerful recording software built on Open Broadcaster Software (OBS), designed for gamers and content creators. Record, clip, and upload gameplay highlights effortlessly, with smart automation and deep game integration.

> **Fork notice:** This fork replaces Segra's cloud (segra.tv accounts and upload hosting) with a self-hosted **[Zipline](https://github.com/diced/zipline)** server. Log in under Settings → Account with your Zipline URL and either your username/password or an API token; uploads go to `POST /api/upload` on your server and share links point at your Zipline instance.

## 🚀 Quick Start

1. Download the latest build from the [Releases](https://github.com/AleksAlfi/Segra-Zipline/releases) page and extract/install it.
2. Open **Settings → Account**. Builds distributed with baked-in defaults already have the server URL filled in — otherwise enter your Zipline server URL.
3. Log in with your Zipline username/password, or paste an API token (Zipline dashboard → Settings → API Token).
4. Record, clip, hit upload — the share link lands on your clipboard via the link button on the clip card.

To build a copy pre-configured for your own server:

```bash
./build-local.sh --url zipline.example.com --clipurl clip.example.com
```

### ✂️ Clip Editor

![image](https://github.com/user-attachments/assets/beed0524-35f1-48be-9dd8-c2455959d2f9)

### 🔥 Highlights

![image](https://github.com/user-attachments/assets/481cc9fa-3efb-412d-b668-8be7d11b9851)


### ⚙️ Settings

![image](https://github.com/user-attachments/assets/de300431-1b63-4ed2-a022-110f8f828d1a)


---

## ✨ Features  
- **Auto-Start Recording**: Begin recording automatically when your game launches.  
- **Instant Clipping**: Save key moments with a hotkey.
- **Direct Upload**: Share clips to your self-hosted **[Zipline](https://github.com/diced/zipline)** server instantly.  
- **Game Integration**: Tracks in-game stats (kills, deaths, assists) to auto-generate highlights, powered by AI.  
- **Lightweight & Fast**: Built on OBS for 4K with 144 FPS capture with minimal performance impact.  
- **Customizable Settings**: Adjust recording quality (NVENC/AMD VCE), hotkeys, storage paths, etc.

---

## Why "Segra"?  
**Segra** (pronounced *"say-grah"*) means **"to win"** in Swedish. We built Segra to help you **preserve those moments**: the chaotic fun with friends, the clutch plays, and the wins (*segra!*) that deserve their own highlight reel.  

---

## 🛠 Installation
1. **Download**: Get `Segra-win-Setup.exe` from [[latest release](https://github.com/Segergren/Segra/releases/latest)].  
2. **Install**: Run the setup.  
3. **Configure**:  
   - Set recording directory and video quality.  
   - Assign hotkeys for clipping/uploading.  
   - Connect your Segra.tv account.  

## 🔄 Uninstallation
1. Open `Windows Settings`
2. Go to `Apps` -> `Installed apps`
3. Search for `Segra`
4. Click `Uninstall`

## 🤝 Contributing  
See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, dependencies, and dev workflow.
Help improve Segra by:  
- Report bugs or suggest features  
- Submit pull requests

---

## 📜 License  
Segra is **GPLv2 licensed**.  

---

## 🔐 Code Signing Policy
<table>
  <tr>
    <td><a href="https://signpath.org/" target="_blank"><img src="https://avatars.githubusercontent.com/u/34448643" height="30" alt="SignPath logo" /></a></td>
    <td>free code signing on Windows provided by <a href="https://signpath.io/" target="_blank">SignPath.io</a>, certificate by <a href="https://signpath.org/" target="_blank">SignPath Foundation</a></td>
  </tr>
</table>


**Team roles**

| Role      | Person |
|-----------|--------|
| Authors   | @Segergren |
| Reviewers | @Segergren |
| Approvers | @Segergren |

See our [Privacy Policy](https://segra.tv/privacy).

## Star History

<a href="https://www.star-history.com/#Segergren/Segra&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Segergren/Segra&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Segergren/Segra&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Segergren/Segra&type=Date" />
 </picture>
</a>

## Acknowledgments
- **[OBS Studio](https://obsproject.com)**: The backbone of Segra's recording engine.
- **[ObsKit.NET](https://github.com/Segergren/ObsKit.NET)**: The modern C#/OBS bridge that powers Segra's recording functionality.
- **[FFmpeg](https://github.com/FFmpeg/FFmpeg)**: for video and image encoding.  
