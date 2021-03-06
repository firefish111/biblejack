// Require the necessary discord.js classes
const { Client, Intents, MessageEmbed } = require("discord.js");
const token = process.env.token;
const prefix = "$"; // temporary
const fs = require("fs");
//const fetch = require('node-fetch')


// database
let { createClient } = require("redis");
const db = new createClient({
  socket: {
    host: "redis-17059.c250.eu-central-1-1.ec2.cloud.redislabs.com",
    port: 17059,
  },
  password: process.env.DBPASS,
});

db.connect();

// yikes code that jam wrote moment
/*
function addLog(id, type, amount, id2){
  fetch('https://unclejesus.firefish.repl.co/transaction', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      'token': process.env.log_token,
      'id': id,
      'type': type,
      'amount': amount,
      'id2': id2,
    })
  })
}
*/

// Create a new client instance
const client = new Client({ intents: [
  Intents.FLAGS.GUILDS,
  Intents.FLAGS.GUILD_MESSAGES, 
  Intents.FLAGS.GUILD_MESSAGE_REACTIONS
] });

let modSet = ["899062038918217758", "905188300690718721", "899224176374710313"]

// emoji index
const emoji = JSON.parse(fs.readFileSync("./emoji.json"));

// markov shit
const Markov = require("js-markov");
let m = new Markov();

m.addStates(fs.readFileSync(`${__dirname}/markov/markov.txt`).toString().split(/\d+:\d+ ?/g));
m.train(6);

const MARKOV_CAP = 3000;

// javascript: master of consistency /s
Array.prototype.choose = function() {
  let ix = Math.floor(Math.random() * this.length);
  return this[ix];
};

// blackjack
let player, banker;

let trueV = (card, used) => /\d+/g.test(card) ? Number(card) : card == "A" ? (used ? 1 : 11) : (card == "down" ? -1 : 10);

let collect = hand => hand.reduce((total, next) => total + trueV(next.card, next.used), 0);

let toEmoji = box => client.emojis.cache.get(emoji[box.suit][box.card]);

let mkEmbed = stake => new MessageEmbed()
  .setColor("#c82626")
  .setTitle("BlackJack")
  .setDescription(`Stake: ${stake} ${client.emojis.cache.get(emoji.misc.bible)}`)
  .addFields(
    { name: `Banker ${collect(banker) !== -2 ? `(${collect(banker) > 21 ? "bust!" : collect(banker)})` : ""}`, value: `${banker.map(toEmoji).join(" ")}` },
    { name: "\u200B", value: "\u200B" },
    // super-ultra-mega-giga-tera-na??ve
    { name: `Player (${collect(player) > 21 && player.length > 2 ? "bust!" : collect(player)})`, value: `${player.map(toEmoji).join(" ")}` },
  )
  .setTimestamp()
  .setFooter("BibleJack Bot");

// cards
const cards = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"
];

// suits
const suits = [
  "spades", "hearts", "clubs", "diamonds"
]

let ace = who => {
  let nextAce = (who ? player : banker)
    .findIndex(i => i.card === "A" && !i.used);
  if (collect((who ? player : banker)) > 21 && nextAce !== -1)
    (who ? player : banker)[nextAce].used = true;
}

let genCard = who => {
  let ix = {
    card: cards.choose(),
    suit: suits.choose()
  };
  if (ix.card === "A") ix.used = false;
  (who ? player : banker).push(ix);
}

let stop;
let now = Date.now();
let interestTick;

// When the client is ready, run this code (only once)
client.once("ready", async () => {
  client.user.setActivity(`for ${prefix}help`, { type: "WATCHING" });
  console.log(`Ready! Bot is in ${client.guilds.cache.size} servers.`);
});

client.on("messageCreate", async msg => {
  console.log(`${msg.author.username}#${msg.author.discriminator}: ${msg.content}`);
  
  if (msg.author.bot) return;
  // if (msg.channelId != "899056782855524353") return;

  if (msg.content.startsWith(prefix)) {
    // default balance
    await db.sendCommand(["HSETNX", msg.author.id, "balance", 20]);

    let args = msg.content.split(" ");
    let cmd = args.shift().slice(prefix.length); // dynamic
    switch (cmd) {
    case "bj":
    case "blackjack":
      let stake = Number(args[0]);

      if (isNaN(stake)) {
        msg.reply("You must bet a number greater than 0.");
        return;
      }

      if (stake < 1) {
        msg.reply("Stake cannot be less than one.");
        return;
      }

      if (stake % 1 !== 0) {
        msg.reply("Stake must be an integer.");
        return;
      }

      let balanc = await db.hGet(msg.author.id, "balance");
      if (balanc <= 0) {
        msg.reply(`You are ${balanc === 0? "broke" : "in debt"}!\nYou cannot bet. Make a loan using ${prefix}loan [amount].`)//You have to make a loan for ${stake} ${client.emojis.cache.get(emoji.misc.bible)}. You will pay ${Math.ceil(stake / 5)} ${client.emojis.cache.get(emoji.misc.bible)} in debt.`);
        return;
      }

      if (stake > balanc) {
        msg.reply("You cannot bet more money than you have.");
        return;
      }

      stop = false;
      player = [], // dont tell anyone i rigged it
      banker = [
        { card: "down", suit: "misc" },
        { card: "down", suit: "misc" },
      ];

      genCard(true); genCard(true);

      if (args.length < 1) {
        msg.reply("Please specify an amount of bibles to bet.");
        return;
      }
			addLog(msg.author.id, 'bet', args[0])
      let game;
        
      const filter = (reaction, user) => [emoji.misc.hit, emoji.misc.stick].includes(reaction.emoji.id) && user.id === msg.author.id;

      ace(true);
      game = await msg.reply({ embeds: [mkEmbed(stake)] });

      do {
        console.log("dbg", collect(player));
        // ace is 1 OR 11
       ace(true);
        
        const embed = mkEmbed(stake);

        if (player.length > 2) {
          game = await game.edit({ embeds: [embed] });
          game.reactions.removeAll();
        }

        // na??ven't
        await game.react(emoji.misc.hit);
        await game.react(emoji.misc.stick);
        await game.awaitReactions({ filter, max: 1, errors: ['limit'] })
          .catch(collected => {
            switch (collected.first()._emoji.id) {
            case emoji.misc.hit:
              genCard(true);
              ace(true);
              console.log("h");
              break;
            case emoji.misc.stick:
              stop = true;
              console.log("s")
              break;
            default:
              throw "wtf";
            }
          });
        
        console.log("^ after")
      } while (player.length < 5 && collect(player) <= 21 && !stop)

      banker = [];
      genCard(false); genCard(false); ace(false);

      if (
        (collect(player) === 21 && player.length === 2) &&
        (collect(banker) < 21)
      ) {
        await game.edit({ embeds: [mkEmbed(stake).addField("You win!", `You win ${stake} ${client.emojis.cache.get(emoji.misc.bible)}!`)] });
        await db.hIncrBy(msg.author.id, "balance", stake);
        return;
      }

      if (collect(player) <= 21) {
        while (collect(banker) < collect(player) && banker.length < 5) {
          genCard(false);
          ace(false);
        }
      }

      // five-card trick
      if (player.length === 5 && collect(player) <= 21 && banker.length < 5) {
        await game.edit({ embeds: [mkEmbed(stake).addField("You win!", `You win ${stake} ${client.emojis.cache.get(emoji.misc.bible)}!`)] });
        await db.hIncrBy(msg.author.id, "balance", stake);
        return;
      }

      if (collect(banker) > 21) {
        await game.edit({ embeds: [mkEmbed(stake).addField("You win!", `You win ${stake} ${client.emojis.cache.get(emoji.misc.bible)}!`)] });
        await db.hIncrBy(msg.author.id, "balance", stake);
        return;
      }

      await game.edit({ embeds: [mkEmbed(stake).addField("You lose!", `You lose ${stake} ${client.emojis.cache.get(emoji.misc.bible)}.`)] }); 
      await db.hIncrBy(msg.author.id, "balance", -stake);
      break;
    case "bal":
    case "balance":
      // infinity
      // await db.hSet("658276923218067466", "balance", Number.MAX_VALUE);
      // if 
      msg.reply(`You currently have ${await db.hGet(msg.author.id, "balance")} ${client.emojis.cache.get(emoji.misc.bible)}.`);

      break;
    case "deck":
      if (args.length === 0) {
        msg.reply(Object.values(emoji).map(i => Object.values(i)).flat().map(e => client.emojis.cache.get(e).toString()).join(""));
      } else if (args.length === 1){
        if (!emoji[args[0]]) { // why do == undefined casting exists
          msg.reply("Category not found")
          break;
        }
        msg.reply(Object.values(emoji[args[0]]).map(e => client.emojis.cache.get(e).toString()).join(""))
      } else {
        try {
          msg.reply(client.emojis.cache.get(emoji[args[0]][args[1]]).toString());
        } catch {
          msg.reply("Emote not found.");
        }
      }
      break;
    case "loan":
      if (args.length === 0) {
        msg.reply("Please specify an amount to loan.");
        return;
      }

      let loanAmount = Number(args[0]);

      if (loanAmount <= 1) {
        msg.reply("You cannot create a loan for a value less than 1.");
        return;
      }

      msg.reply(`You are creating a loan for ${loanAmount} ${client.emojis.cache.get(emoji.misc.bible)}. Your debt has been adjusted accordingly.\nYou can view your debt using the ${prefix}debt command.`);
      await db.hIncrBy(msg.author.id, "balance", loanAmount);
      await db.hSet(msg.author.id, "debt", Math.ceil(loanAmount*6/5));
      //msg.reply("Unfortunately, loans do not work. Please ask <@!658276923218067466> to reset your balance if you are broke.");
      break;
    case "debt":
      await db.sendCommand(["HSETNX", msg.author.id, "debt", 0]);

      if (args.length < 1) {
        msg.reply(`You currently owe ${await db.hGet(msg.author.id, "debt")} ${client.emojis.cache.get(emoji.misc.bible)} to the loan company.\nYou can pay this off using ${prefix}debt pay [amount]/all`);
        break;
      }

      if (args[0] === "pay") {
        if (args.length < 2) {
          msg.reply("Please supply an amount to pay.");
          break;
        }

        let debt = await db.hGet(msg.author.id, "debt");

        let pay = args[1] === "all" ? debt : Number(args[1]);

        if (isNaN(pay)) {
          msg.reply("You must specify a number.");
          break;
        }

        if (pay > debt) {
          msg.reply("You cannot pay off more debt than you have.");
          break;
        }

        db.hIncrBy(msg.author.id, "debt", -pay);
        db.hIncrBy(msg.author.id, "balance", -pay);

        msg.reply(`You have payed off ${pay} ${client.emojis.cache.get(emoji.misc.bible)}. You now owe ${await db.hGet(msg.author.id, "debt")} ${client.emojis.cache.get(emoji.misc.bible)}.`)
      }
      break;
    case "status":
      // courtesy of https://stackoverflow.com/a/54257210
      if (!msg.member.roles.cache.some(role => modSet.includes(role.id))) {
        msg.reply(`Command ${cmd} not found.`);
        break;
      }

      client.user.setActivity(
        args.slice(["listening", "competing"]
          .includes(args[0].toLowerCase()) ? 2 : 1)
          .join(" "), {
            type: args[0].toUpperCase()
          }
      );

      msg.reply("Done");
      break;
    case "eggle":
      msg.reply("you're mother");
      break;
    case "eval":
      msg.reply("No, not even for bot admins.")
      break;
    case "mk":
    case "markov":
      if (args.length === 0 || args[0] > MARKOV_CAP)
        args[0] = MARKOV_CAP;

      msg.reply(m.generateRandom(args[0]));
      break;
    case "help":
      let helpEmbed = new MessageEmbed()
        .setColor("#c82626")
        .setTitle("BibleJack Help")
        .setDescription(`Help menu`)
        .addFields(
          { name: `${prefix}help`, value: `Shows this help menu.` },
          { name: `${prefix}markov/mk [length]`, value: "Generate a bible verse with maximum length of `length`. (capped at/default 3000)" },
          { name: `${prefix}deck [suit [card]]`, value: "Prints all cards if no arguments; single suit if only one argument; or a specific card."},
          { name: `${prefix}balance/bal`, value: "Shows the amount of bibles you have."},
          { name: `${prefix}blackjack/bj amount`, value: "Plays a game of blackjack, betting `amount` bibles."},
          { name: `${prefix}loan amount`, value: "Creates a loan for `amount`, adding the appropriate amount of debt to your account."},
          { name: `${prefix}debt [pay amount/all]`, value: "Returns the amount of debt connected to your account.\nAlternatively, use the `pay` subcommand to pay off `amount` bibles or `all` debt."},
        )
        .setTimestamp()
        .setFooter("BibleJack Bot");

      if (msg.member.roles.cache.some(role => modSet.includes(role.id))) {
        helpEmbed.addFields(
          { name: `${prefix}status type message`, value: "Sets the bot's status." },
          { name: `${prefix}eggle`, value: "~~nobody knows about this~~" },
          { name: `${prefix}eval`, value: "please dont run this i beg you i have a family" },
        )
      }
      msg.reply({ embeds: [helpEmbed] })
      break;
    default:
      msg.reply(`Command ${cmd} not found.`)
    }
  }

  // triggers (because carl sucks)
  if (msg.content.includes("nuke")) {
    msg.channel.send("Did someone say ***nuke***?");
  }
});

// Login to Discord with your client's token
client.login(token);
