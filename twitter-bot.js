const Twit = require("twit");
const fs = require("fs");

const { downloadMedia } = require("./download");

class TwitterBot {
  constructor(props) {
    this.T = new Twit({
      consumer_key: props.consumer_key,
      consumer_secret: props.consumer_secret,
      access_token: props.access_token,
      access_token_secret: props.access_token_secret,
    });
    this.triggerWord = props.triggerWord;
  }

  getAdminUserInfo = () => {
    return new Promise((resolve, reject) => {
      this.T.get("account/verify_credentials", { skip_status: true })
        .then((result) => {
          const id = result.data.id_str;
          resolve(id);
        })
        .catch((err) => {
          reject(err);
        });
    });
  };

  getRecievedMessages = (authUserId, messages) => {
    return messages.filter(
      (msg) => msg.message_create.sender_id !== authUserId
    );
  };

  getUnnecessaryMessages = (messages, trigger) => {
    return messages.filter((msg) => {
      const msgs = msg.message_create.message_data.text;
      const words = this.getEachWord(msgs);
      return !words.includes(trigger);
    });
  };

  getTriggerMessages = (messages, trigger) => {
    return messages.filter((msg) => {
      const msgs = msg.message_create.message_data.text;
      const words = this.getEachWord(msgs);
      return words.includes(trigger);
    });
  };

  getEachWord = (msgs) => {
    let words = [];
    let finalWords = [];
    const separateEnter = msgs.split("\n");
    separateEnter.forEach((line) => (words = [...words, ...line.split(" ")]));
    words.forEach((word) => {
      const splitComma = word.split(",");
      finalWords = [...finalWords, ...splitComma];
    });
    return finalWords;
  };

  deleteUnnecessaryMessages = async (unnecessaryMsgs) => {
    if (unnecessaryMsgs.length > 3) {
      for (let i = 0; i < 3; i++) {
        await this.deleteMessage(unnecessaryMsgs[i]);
        await this.sleep(2000);
      }
    } else {
      for (const msg of unnecessaryMsgs) {
        await this.deleteMessage(msg);
        await this.sleep(2000);
      }
    }
  };

  deleteMessage = (unnecessaryMsg) => {
    return new Promise((resolve, reject) => {
      this.T.delete(
        "direct_messages/events/destroy",
        { id: unnecessaryMsg.id },
        (error, data) => {
          if (!error) {
            console.log(`deleted msg id:${unnecessaryMsg.id}`);
            resolve({
              message: `message has been deleted!`,
              data,
            });
          } else {
            reject(error);
          }
        }
      );
    });
  };

  deleteOutOfBoundMessages = async (triggerMsgs) => {
    try {
      let msgToDelete = [];
      for (const [i, msg] of triggerMsgs.entries()) {
        let text = msg.message_create.message_data.text;
        if (msg.message_create.message_data.attachment) {
          text = text.split(
            msg.message_create.message_data.attachment.media.url
          )[0];
        }
        if (text.length > 280) {
          msgToDelete.push(msg);
          await this.deleteMessage(msg);
          await this.sleep(2000);
        }
        if (i == 2) {
          break;
        }
      }
      for (const msg of msgToDelete) {
        const idx = triggerMsgs.indexOf(msg);
        triggerMsgs.splice(idx, 1);
      }
    } catch (error) {
      throw error;
    }
  };

  sleep = (time) => {
    return new Promise((resolve) => setTimeout(resolve, time));
  };

  getDirectMessage = (authUserId) => {
    return new Promise((resolve, reject) => {
      this.T.get("direct_messages/events/list", async (error, data) => {
        try {
          if (!error) {
            let lastMessage = {};
            const messages = data.events;

            const recievedMsg = this.getRecievedMessages(authUserId, messages);
            const unnecessaryMsg = this.getUnnecessaryMessages(
              recievedMsg,
              this.triggerWord
            );
            const triggerMsg = this.getTriggerMessages(
              recievedMsg,
              this.triggerWord
            );

            await this.deleteUnnecessaryMessages(unnecessaryMsg);
            await this.deleteOutOfBoundMessages(triggerMsg);

            if (triggerMsg[0]) {
              lastMessage = triggerMsg[triggerMsg.length - 1];
            }

            resolve(lastMessage);
          } else {
            reject(error);
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  };

  uploadMedia = (filePath, type) => {
    return new Promise((resolve, reject) => {
      console.log("media is uploading ........");
      if (type == "photo") {
        const b64content = fs.readFileSync(filePath, { encoding: "base64" });
        this.T.post("media/upload", { media_data: b64content }, (err, data) => {
          if (!err) {
            resolve(data);
            console.log("media has been uploaded!");
          } else {
            fs.unlinkSync(filePath);
            reject(err);
          }
        });
      } else {
        this.T.postMediaChunked({ file_path: filePath }, (error, data) => {
          if (!error) {
            resolve(data);
            console.log("media has been uploaded!");
          } else {
            fs.unlinkSync(filePath);
            reject(error);
          }
        });
      }
    });
  };

  tweetMessage = (message) => {
    return new Promise(async (resolve, reject) => {
      try {
        const text = message.message_create.message_data.text;
        const attachment = message.message_create.message_data.attachment;

        const payload = { status: text };

        if (attachment) {
          const media = attachment.media;
          const shortUrl = attachment.media.url;
          payload.status = text.split(shortUrl)[0];

          let mediaUrl = "";
          let type = attachment.media.type;
          if (type == "animated_gif") {
            mediaUrl = media.video_info.variants[0].url;
          } else if (type == "video") {
            mediaUrl = media.video_info.variants[0].url.split("?")[0];
          } else {
            mediaUrl = attachment.media.media_url;
          }

          const splittedUrl = mediaUrl.split("/");
          const filename = splittedUrl[splittedUrl.length - 1];
          console.log(mediaUrl, filename);

          await downloadMedia(mediaUrl, filename);

          const uploadedMedia = await this.uploadMedia(filename, type);
          console.log(uploadedMedia);

          fs.unlinkSync(filename);
          console.log("media has been deleted from local");
          payload.media_ids = [uploadedMedia.media_id_string];
        }
        console.log(`process updating status with id: ${message.id}`);
        this.T.post("statuses/update", payload, (error, data) => {
          if (!error) {
            console.log(
              `new status successfully posted with dm id ${message.id}`
            );
            this.deleteMessage(message);
            resolve({
              message: `new status successfully posted with dm id ${message.id}`,
              data,
            });
          } else {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  };
}

module.exports = { TwitterBot };
