const crypto = require("crypto");
const OAuth = require("oauth-1.0a");
const axios = require("axios");
const fs = require("fs");

const OAuthHelper = (mediaUrl) => {
  const oauth = OAuth({
    consumer: {
      key: process.env.CONSUMER_KEY,
      secret: process.env.CONSUMER_SECRET,
    },
    signature_method: "HMAC-SHA1",
    hash_function(base_string, key) {
      return crypto
        .createHmac("sha1", key)
        .update(base_string)
        .digest("base64");
    },
  });

  const authorization = oauth.authorize(
    {
      url: mediaUrl,
      method: "GET",
    },
    {
      key: process.env.ACCESS_TOKEN,
      secret: process.env.ACCESS_TOKEN_SECRET,
    }
  );

  return oauth.toHeader(authorization);
};

const downloadMedia = async (mediaUrl, filename) => {
  try {
    console.log("DOWNLOADING MEDIA .............");
    const authorization = OAuthHelper(mediaUrl);
    const { data } = await axios.get(mediaUrl, {
      headers: authorization,
      responseType: "arraybuffer",
    });
    fs.writeFileSync(filename, data);
    console.log("MEDIA HAS BEEN DOWNLOADED!");
    return data;
  } catch (error) {
    throw new Error("error downloading media", error);
  }
};

module.exports = { downloadMedia };
