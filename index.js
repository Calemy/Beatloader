import fs from "fs"
import fetch from "node-fetch"
import rpc from "discord-rpc"
import Logger from "cutesy.js"
import { showOnDiscord, modes, status, custom, attributes, search as query, downloadVideo } from "./config.js"

const logger = new Logger()
const client = new rpc.Client({ transport: "ipc" })
let discordRPC = false;

const time = new Date()
let count = 0
let cache = []
let size = 0;
let offset = 0;
let error = false;

if(showOnDiscord){
    client.on("ready", () => {
        discordRPC = true;
        main()
    })

    client.on("error", () => {
        logger.red("Discord RPC error").send()
        main()
    })

    client.login({ 
        clientId: "1107445406759145492", 
    })
} else {
    main()
}

async function main(){
    updateActivity(true)
    if(!fs.existsSync("./.data")) fs.mkdirSync("./.data")
    if(!fs.existsSync("./.data/completed")) fs.writeFileSync("./.data/completed", "")
    if(!fs.existsSync("./.data/size")) fs.writeFileSync("./.data/size", "")
    if(!fs.existsSync("./songs")) fs.mkdirSync("./songs")

    logger.purpleBlue("Welcome to Beatloader").send()
    logger.purpleBlue("Loading attempted maps...").send()

    const completedFile = fs.readFileSync("./.data/completed", "utf8")
    const completed = completedFile.split(",")
    completed.length = completed.length - 1
    count = completed.length

    logger.green(`${completed.length} maps found`).send()

    cache = [...completed]

    logger.purpleBlue("Loading saved maps...").send()
    const songs = fs.readdirSync("./songs")

    for(let i = 0; i < songs.length; i++){
        const id = songs[i].split(".osz")[0]
        if(cache.indexOf(id) != -1) continue;
        cache.push(id)
        count++
    }

    logger.green(`${songs.length} maps found`).send()
    logger.purpleBlue("Loading size...").send()

    const sizeFile = fs.readFileSync("./.data/size", "utf8")
    const sizes = sizeFile.split(",")
    sizes.length = sizes.length - 1

    for(let i = 0; i < sizes.length; i++){
        size += parseInt(sizes[i])
    }

    logger.green(`${cache.length} maps found (${(size / (1024 * 1024 * 1024)).toFixed(2)}GB)`).send()

    while(!error){
        await crawl()
    }
    logger.red("Reached end of downloads, terminating...").send()
    return process.exit(1)
}

function crawl(){
    return new Promise(async (resolve) => {
        const req = await fetch(`https://catboy.best/api/v2/search?q=${query}[${attributes}]&mode=${modes.join("&mode=")}&status=${status.join("&status=")}&limit=1000&offset=${offset}`)
        if(req.status != 200){
            if(req.status == 500){
                logger.red("Something in your query is wrong, please fix this or report this to a developer.").send()
                return process.exit(1)
            }
            logger.red(`catboy.best seems to not have given you a proper response, please report this to a developer. (${req.status})`).send()
            return process.exit(1)
        }
        const search = await req.json()

        if(search.length == 0) error = true;

        for(let i = 0; i < search.length; i++) {
            if(cache.indexOf(String(search[i].id)) != -1) continue;
            if(!custom(search[i])) continue;
            const t = await download(search[i])
            await new Promise((r) => setTimeout(r, t))
        }

        offset += search.length

        return resolve()
    })
}

function download(data, retries = 0){
    const id = String(data.id)
    const { color, tag } = rankedStatus(data.ranked)
    return new Promise(async (resolve) => {
        const start = Date.now()
        try {
            const file = await fetch(`https://catboy.best/d/${id}${downloadVideo ? "" : "n"}`)
            if(!file.ok){
                switch(file.status){
                    case 425:
                        logger.red("Mirror reached ratelimit, pausing...").send()
                        return resolve(1000 * 60 * 10)
                    case 429:
                        logger.red("Waiting for ratelimit cooldown").send()
                        await new Promise((r) => setTimeout(r, 1000 * 60))
                        return resolve(await download(...arguments))
                    case 451:
                        logger.red("Map not available for download").send()
                        return resolve(1)
                    case 500:
                        logger.red("Internal Server Error, stopping program to prevent further errors.").send()
                        return process.exit(1)
                    case 502:
                        logger.red("Server offline, stopping program.").send()
                        return process.exit(1)
                    default:
                        logger.red(`Something went wrong: ${file.status}`).send()
                        return resolve(1)
                }
            }
            const length = file.headers.get("content-length")
            const origin = file.headers.get("content-origin")
            const timeout = (() => {
                switch(origin){
                    case "local":
                        return 1000 * (60 / (30 / 1))
                    case "s3":
                        return 1000 * (60 / (30 / 3))
                    case "bancho":
                        return 1000 * (60 / (30 / 5))
                }
            })();

            const stream = fs.createWriteStream(`./songs/${id}.osz`);
            file.body.pipe(stream);
            file.body.once("error", () => {
                fileStream.destroy()
                fs.rmSync(`./songs/${id}.osz`)
            })

            stream.once("error", (e) => {
                if(e.message == "ENOSPC: no space left on device, write"){
                    logger.red("No space left, exiting program..").send()
                    return process.exit(1)
                }
            })

            stream.once("close", () => {
                if(!stream.writableFinished) return resolve(timeout);
                const downloadTime = Date.now() - start
                size += Number(length)
                count++
                fs.appendFileSync("./.data/completed", `${id},`)
                fs.appendFileSync("./.data/size", `${length},`)
                logger.white(`${id.padStart(7, " ")} | `)[color](`${tag} `)
                .white(`| ${data.artist} - ${data.title} (${data.creator}) | `)
                .green(`${(downloadTime / 1000).toFixed(2)} seconds (${(length / (1024 * 1024)).toFixed(2)}MB)`).send()
                updateActivity()
                return resolve(timeout)
            })
        } catch (error){
            if(retries < 3) return resolve(download(data, ++retries))
            logger.red("Something went wrong:").send()
            console.log(error)
        }
    })
}

function updateActivity(start){
    if(!discordRPC) return;
    let activity = {
        startTimestamp: time,
        instance: false,
    }

    if(start){
        activity.details = "Running Beatloader v1"
        activity.state = "Starting up..."
    } else {
        activity.details = "Downloading from catboy.best",
        activity.state = `${count} beatmaps (${(size / (1024 * 1024 * 1024)).toFixed(2)}GB)`
        activity.largeImageKey = "logo"
        activity.buttons = [
            { label: "Visit catboy.best", url: "https://catboy.best"},
            { label: "Download", url: "https://github.com/calemy/Beatloader"}
        ]
    }

    client.setActivity(activity);
}

function rankedStatus(status){
    let color;
    let tag;

    switch(status){
        case -2:
            color = "red"
            tag = "Graveyard"
            break;
        case -1:
            color = "orange"
            tag = "WIP"
            break;
        case 0:
            color = "red"
            tag = "Pending"
            break;
        case 1: case 2:
            color = "cyan"
            tag = "Ranked"
            break;
        case 3:
            color = "yellow"
            tag = "Qualified"
            break;
        case 4:
            color = "pink"
            tag = "Loved"
            break;
    }

    return { color, tag }
}