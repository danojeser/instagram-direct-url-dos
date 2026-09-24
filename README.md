<p align="center">
<img src="https://avatars0.githubusercontent.com/u/4674786?s=400&u=2f77d382a4428c141558772a2b7ad3a36bebf5bc&v=4" width="128" height="128"/>
</p>
<p align="center">
<a href="#"><img title="Instagram-Direct-URL" src="https://img.shields.io/badge/Instagram%20Direct%20URL-green?colorA=%23ff0000&colorB=C13584&style=for-the-badge"></a>
</p>
<p align="center">
<a href="https://github.com/victorsouzaleal"><img title="Autor" src="https://img.shields.io/badge/Author-victorsouzaleal-5851DB.svg?style=for-the-badge&logo=github"></a>
</p>
</p>
<p align="center">
<a href="#"><img title="Version" src="https://img.shields.io/github/package-json/v/victorsouzaleal/instagram-direct-url?color=%23833AB4&logo=github&style=flat-square"></a>
<a href="#"><img title="Size" src="https://img.shields.io/bundlephobia/min/instagram-url-direct?color=%23833AB4&logo=npm&style=flat-square"></a>
<a href="https://github.com/victorsouzaleal/followers"><img title="Followers" src="https://img.shields.io/github/followers/victorsouzaleal?color=%23833AB4&logo=github&style=flat-square"></a>
<a href="https://github.com/victorsouzaleal/instagram-direct-url/stargazers/"><img title="Stars" src="https://img.shields.io/github/stars/victorsouzaleal/instagram-direct-url?color=%23833AB4&logo=github&style=flat-square"></a>
<a href="https://github.com/victorsouzaleal/lbot-whatsapp/watchers"><img title="Watching" src="https://img.shields.io/github/watchers/victorsouzaleal/instagram-direct-url?color=%23833AB4&logo=github&style=flat-square"></a>
<a href="#"><img title="MAINTENED" src="https://img.shields.io/badge/MAINTENED-YES-%23833AB4?style=flat-square"/></a>
</p>

## Works with:
It currently works with public Instagram posts and reels, which can contain multiple images/videos or a single one.

Stories and private posts are not supported.

Data is obtained from the public embed page of the post, so no login is required. Some fields (`owner_fullname`, `is_private`, `is_ad`) may not be available from that source and will be returned as empty/`false`.

## Instalation :
```bash
> npm i github:danojeser/instagram-direct-url-dos#v2.1.0
```
The package is built automatically on install (`prepare` script).

## Example
```js
import { instagramGetUrl } from "instagram-url-direct"
// or: const { instagramGetUrl } = require("instagram-url-direct")

let data = await instagramGetUrl("https://www.instagram.com/tv/CdmYaq3LAYo/")
console.log(data)

// Optional config: retries on 429/403 responses and initial delay (ms) between them
data = await instagramGetUrl("https://www.instagram.com/reel/CdmYaq3LAYo/", { retries: 3, delay: 2000 })
```

## Result Example

```ts
{
    results_number: number,
    post_info: {
        owner_username: string,
        owner_fullname: string,
        is_verified: boolean,
        is_private: boolean,
        likes: number,
        is_ad: boolean,
        caption: string
    },
    url_list: string[],
    media_details: {
        type: 'video' | 'image',
        dimensions: {
            height: number,
            width: number
        },
        url: string,
        video_view_count?: number, // only videos
        thumbnail?: string         // only videos
    }[]
}
```
