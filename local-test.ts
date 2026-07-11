import { load } from "jsr:@std/dotenv";
import checkBrokenFeeds from "./feedbin-broken-feeds.cron.tsx";

await load({ export: true })
checkBrokenFeeds();