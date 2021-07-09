const express = require("express");
const CronJob = require("cron").CronJob;
const app = express();
const cors = require("cors");
require("dotenv").config();

const { TwitterBot } = require("./twitter-bot");

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const bot = new TwitterBot({
  consumer_key: process.env.CONSUMER_KEY,
  consumer_secret: process.env.CONSUMER_SECRET,
  access_token: process.env.ACCESS_TOKEN,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET,
  triggerWord: process.env.TRIGGER,
});

async function onComplete() {
  console.log("my job is done!");
}

const job = new CronJob("0 */3 * * * *", doJob, onComplete, true);

async function doJob() {
  let tempMessage;
  try {
    const authenticatedUserId = await bot.getAdminUserInfo();
    const message = await bot.getDirectMessage(authenticatedUserId);
    if (message.id) {
      tempMessage = message;
      await bot.tweetMessage(message);
    } else {
      console.log("no tweet to post");
    }
  } catch (error) {
    console.log(error, "\n--------- ERROR ------------");
    if (tempMessage.id) {
      await bot.deleteMessage(tempMessage);
    }
  }
}

app.get("/", (req, res, next) => {
  res.send("Welcome to twitter bot server backend");
});

app.get("/trigger", async (req, res, next) => {
  job.fireOnTick();
  res.send("Job triggered");
});

app.listen(PORT, () => console.log(`Server is listening to port ${PORT}`));
