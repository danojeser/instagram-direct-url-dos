import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import qs from 'qs'

//Interface
export interface InstagramResponse {
    results_number: number,
    url_list: string[],
    post_info: {
        owner_username: string,
        owner_fullname: string,
        is_verified: boolean,
        is_private: boolean,
        likes: number,
        is_ad: boolean,
        caption: string
    },
    media_details: {
        type: string,
        dimensions: {
            height: number,
            width: number
        },
        url: string,
        video_view_count?: number,
        thumbnail?: string
    }[],
}

export interface InstagramError {
    error: string
}

export interface InstagramConfig {
    retries: number,
    delay: number
}

//Main function
export async function instagramGetUrl (url_media : string, config : InstagramConfig = { retries: 5, delay: 1000 }) : Promise<InstagramResponse> {
    url_media = await checkRedirect(url_media)
    const SHORTCODE = getShortcode(url_media)

    //The embed page is public and doesn't require login, GraphQL is kept as a fallback
    try {
        return await instagramEmbedRequest(SHORTCODE, config.retries, config.delay)
    } catch(embedErr : any){
        try {
            const INSTAGRAM_REQUEST = await instagramRequest(SHORTCODE, config.retries, config.delay)
            return createOutputData(INSTAGRAM_REQUEST)
        } catch(graphqlErr : any){
            throw new Error(`${embedErr.message} | ${graphqlErr.message}`)
        }
    }
}

//Utilities
async function checkRedirect (url : string){
    let split_url = url.split("/")

    if (split_url.includes("share")){
        let res = await axios.get(url)
        return res.request.path
    }

    return url
}

function formatPostInfo(requestData : any){
    try{
        let mediaCapt = requestData.edge_media_to_caption?.edges ?? []
        const capt = (mediaCapt.length === 0) ? "" : mediaCapt[0].node.text
        return {
            owner_username: requestData.owner.username,
            owner_fullname: requestData.owner.full_name ?? "",
            is_verified: requestData.owner.is_verified ?? false,
            is_private: requestData.owner.is_private ?? false,
            likes: (requestData.edge_media_preview_like ?? requestData.edge_liked_by)?.count ?? 0,
            is_ad: requestData.is_ad ?? false,
            caption: capt
        }
    } catch(err : any){
        throw new Error(`Failed to format post info: ${err.message}`)
    }
}

function formatMediaDetails(mediaData : any){
    try{
        if(mediaData.is_video){
            return {
                type: "video",
                dimensions: mediaData.dimensions,
                video_view_count: mediaData.video_view_count,
                url: mediaData.video_url,
                thumbnail: mediaData.display_url
            }
        } else {
            return {
                type: "image",
                dimensions: mediaData.dimensions,
                url: mediaData.display_url
            }
        }
    } catch(err : any){
        throw new Error(`Failed to format media details: ${err.message}`)
    }
}

function getShortcode(url : string){
    const split_url = url.split(/[?#]/)[0].split("/")
    const post_tags = ["p", "reel", "tv", "reels"]
    const index_tag = split_url.findIndex(item => post_tags.includes(item))
    const shortcode = index_tag === -1 ? undefined : split_url[index_tag + 1]

    if (!shortcode) throw new Error("Failed to obtain shortcode: only posts/reels supported, check if your link is valid.")
    return shortcode
}

async function getCSRFToken(){
    try {
        let config : AxiosRequestConfig = {
            method: 'GET',
            url: 'https://www.instagram.com/',
        }

        const token = await new Promise <string>((resolve, reject) => {
            axios.request(config).then((response: AxiosResponse) => {
                if (!response.headers['set-cookie']){
                    reject(new Error('CSRF token not found in response headers.'))
                } else {
                    const csrfCookie = response.headers['set-cookie'][0]
                    const csrfToken = csrfCookie.split(";")[0].replace("csrftoken=", '')
                    resolve(csrfToken)
                }
            }).catch((err) => {
                reject(err)
            })
        })

        return token
    } catch(err: any) {
        throw new Error(`Failed to obtain CSRF: ${err.message}`)
    }
}

function isSidecar(requestData : any){
    try{
        return ["XDTGraphSidecar", "GraphSidecar"].includes(requestData["__typename"])
    } catch(err : any){
        throw new Error(`Failed sidecar verification: ${err.message}`)
    }
}

async function withRetries<T>(request: () => Promise<T>, retries: number, delay: number) : Promise<T> {
    try {
        return await request()
    } catch(err : any){
        const errorCodes = [429, 403]

        if (err.response && errorCodes.includes(err.response.status) && retries > 0) {
            const retryAfter = err.response.headers['retry-after']
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay
            await new Promise(res => setTimeout(res, waitTime))
            return withRetries(request, retries - 1, delay * 2)
        }

        throw err
    }
}

async function instagramEmbedRequest(shortcode: string, retries: number, delay: number) {
    try{
        const { data : html } = await withRetries(() => axios.get<string>(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, { responseType: 'text' }), retries, delay)

        //Videos, reels and sidecars include the post data as JSON
        const contextMatch = html.match(/"contextJSON":("(?:[^"\\]|\\.)*")/)
        if (contextMatch) {
            const shortcodeMedia = JSON.parse(JSON.parse(contextMatch[1]))?.gql_data?.shortcode_media
            if (shortcodeMedia) return createOutputData(shortcodeMedia)
        }

        //Private, removed, age/region restricted or non-embeddable posts
        if (html.includes('class="EmbedBrokenMedia"')) throw new Error("Post not available without login (it may be private, removed, restricted or have embedding disabled).")

        //Single images only include the post data in the HTML
        return createOutputDataFromEmbedHtml(html)
    } catch(err : any){
        throw new Error(`Failed instagram embed request: ${err.message}`)
    }
}

function decodeHtml(text : string){
    return text
        .replace(/<br\s*\/?>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
}

function createOutputDataFromEmbedHtml(html : string) : InstagramResponse {
    const mediaType = html.match(/data-media-type="([^"]+)"/)?.[1]
    const imageTag = html.match(/<img class="EmbeddedMediaImage"[^>]*>/)?.[0]
    const imageUrl = imageTag?.match(/src="([^"]+)"/)?.[1]

    if (mediaType !== "GraphImage" || !imageUrl) throw new Error("Only posts/reels supported, check if your link is valid.")

    const url = decodeHtml(imageUrl)
    const srcsetWidths = [...(imageTag?.match(/srcset="([^"]+)"/)?.[1] ?? "").matchAll(/ (\d+)w/g)].map(m => parseInt(m[1]))
    const width = srcsetWidths.length ? Math.max(...srcsetWidths) : 0
    const ratio = parseFloat(html.match(/class="Content EmbedFrame" style="padding-bottom: ([\d.]+)%/)?.[1] ?? "0")
    const likes = parseInt(html.match(/data-log-event="likeCountClick"[^>]*>([\d,.]+) likes?</)?.[1].replace(/[,.]/g, "") ?? "0")
    const captionHtml = html.match(/<div class="Caption">([\s\S]*?)<div class="Footer">/)?.[1] ?? ""
    const caption = decodeHtml(captionHtml.replace(/^<a class="CaptionUsername"[^>]*>.*?<\/a>/, "")).trim()

    return {
        results_number: 1,
        url_list: [url],
        post_info: {
            owner_username: decodeHtml(html.match(/<span class="UsernameText">([^<]*)<\/span>/)?.[1] ?? ""),
            owner_fullname: "",
            is_verified: /class="Username"[^>]*>[\s\S]*?<\/span><i class="[^"]*VerifiedSprite/.test(html),
            is_private: false,
            likes,
            is_ad: false,
            caption
        },
        media_details: [{
            type: "image",
            dimensions: { height: Math.round(width * ratio / 100), width },
            url
        }]
    }
}

async function instagramRequest(shortcode: string, retries: number, delay: number) {
    try{
        const BASE_URL = "https://www.instagram.com/graphql/query"
        const INSTAGRAM_DOCUMENT_ID = "9510064595728286"
        let dataBody = qs.stringify({
            'variables': JSON.stringify({
                'shortcode': shortcode,
                'fetch_tagged_user_count': null,
                'hoisted_comment_id': null,
                'hoisted_reply_id': null
            }),
            'doc_id': INSTAGRAM_DOCUMENT_ID
        });

        const data = await withRetries(async () => {
            const token = await getCSRFToken()

            let config : AxiosRequestConfig = {
                method: 'post',
                maxBodyLength: Infinity,
                url: BASE_URL,
                headers: {
                    'X-CSRFToken': token,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                data : dataBody
            };

            return (await axios.request(config)).data
        }, retries, delay)

        if(!data.data?.xdt_shortcode_media) throw new Error("Only posts/reels supported, check if your link is valid.")
        return data.data.xdt_shortcode_media
    } catch(err : any){
        throw new Error(`Failed instagram request: ${err.message}`)
    }
}

function createOutputData(requestData : any) : InstagramResponse {
    try{
        let url_list : string[] = [], media_details : InstagramResponse['media_details'] = []
        const IS_SIDECAR = isSidecar(requestData)
        if(IS_SIDECAR){
            //Post with sidecar
            requestData.edge_sidecar_to_children.edges.forEach((media : any)=>{
                media_details.push(formatMediaDetails(media.node))
                if(media.node.is_video){ //Sidecar video item
                    url_list.push(media.node.video_url as string)
                } else { //Sidecar image item
                    url_list.push(media.node.display_url as string)
                }
            })
        } else {
            //Post without sidecar
            media_details.push(formatMediaDetails(requestData))
            if(requestData.is_video){ // Video media
                url_list.push(requestData.video_url as string)
            } else { //Image media
                url_list.push(requestData.display_url as string)
            }
        }

        return {
            results_number: url_list.length,
            url_list,
            post_info: formatPostInfo(requestData),
            media_details
        }
    } catch(err : any){
        throw new Error(`Failed to create output data: ${err.message}`)
    }
}
