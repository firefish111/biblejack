// Require the necessary discord.js classes
const { Client, Intents, MessageEmbed } = require("discord.js");
const token = process.env.token;
const prefix = "$"; // temporary
const fs = require("fs");
const rl = require("readline-sync");

// database
const Database = require("@replit/database");
const db = new Database();

// Create a new client instance
const client = new Client({ intents: [
  Intents.FLAGS.GUILDS,
  Intents.FLAGS.GUILD_MESSAGES, 
  Intents.FLAGS.GUILD_MESSAGE_REACTIONS
] });

let addBibles = (amount, snowflake) => {
  db.get(snowflake).then(async value => {
    await db.set(snowflake, value + amount);
  });
}

// emoji index
const emoji = require("./emoji");

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

let trueV = (card, used) => /\d+/g.test(card) ? Number(card) : card == "A" ? used ? 1 : 11 : card == "down" ? -1 : 10;

let collect = hand => hand.reduce((total, next) => total + trueV(next.card, next.used), 0);

let toEmoji = box => client.emojis.cache.get(emoji[box.suit][box.card]);

let mkEmbed = stake => new MessageEmbed()
  .setColor("#c82626")
  .setTitle("BlackJack")
  .setDescription(`Stake: ${stake} ${client.emojis.cache.get(emoji.misc.bible)}`)
  .addFields(
    { name: `Banker ${collect(banker) !== -2 ? `(${collect(banker) > 21 ? "bust!" : collect(banker)})` : ""}`, value: `${banker.map(toEmoji).join(" ")}` },
    { name: "\u200B", value: "\u200B" },
    // super-ultra-mega-giga-tera-naïve
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

// When the client is ready, run this code (only once)
client.once("ready", async () => {
	client.user.setActivity(`for ${prefix}help`, { type: "WATCHING" });
	console.log("Ready!");
  // grr the code no work 
  client.channels.fetch("899281353529524264").then(channel => {
	  while (false) { // while false
			let message = rl.question("> ");
			channel.send(message);
		}
	})
    //let message = rl.question("> ");
    //mods.send({ content: message });
  
});

client.on("messageCreate", async msg => {
	console.log(`${msg.author.username}#${msg.author.discriminator}: ${msg.content}`);
  
  if (msg.author.bot) return;
  // if (msg.channelId != "899056782855524353") return;

	if (msg.content.startsWith(prefix)) {
		args = msg.content.split(" ");
		cmd = args.shift().slice(prefix.length); // dynamic
    switch (cmd) {
    case "bj":
    case "blackjack":
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

      let stake = Number(args[0]);

      let game;
        
      const filter = (reaction, user) => [emoji.misc.hit, emoji.misc.stick].includes(reaction.emoji.id) && user.id === msg.author.id;

      let embed = mkEmbed(stake);

      game = await msg.reply({ embeds: [mkEmbed(stake)] });

      do {
        console.log("dbg");
        // ace is 1 OR 11
        ace(true);
        
        const embed = mkEmbed(stake);

        if (player.length > 2) {
          game = await game.edit({ embeds: [embed] });
          game.reactions.removeAll();
        }

        // naïven't
        await game.react(emoji.misc.hit);
        await game.react(emoji.misc.stick);
        await game.awaitReactions({ filter,  max: 1,errors: ['limit'] })
          .catch(collected => {
            switch (collected.first()._emoji.id) {
            case emoji.misc.hit:
              genCard(true);
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
        addBibles(stake, msg.author.id);
        return;
      }



      if (collect(player) <= 21) {
        while (collect(banker) < collect(player)) {
          genCard(false);
          ace(false);
        }
      }

      if (collect(banker) > 21) {
        await game.edit({ embeds: [mkEmbed(stake).addField("You win!", `You win ${stake} ${client.emojis.cache.get(emoji.misc.bible)}!`)] });
        addBibles(stake, msg.author.id);
        return;
      }

      await game.edit({ embeds: [mkEmbed(stake).addField("Banker wins!", `You lose ${stake} ${client.emojis.cache.get(emoji.misc.bible)}.`)] }); 
      addBibles(-stake, msg.author.id);
      break;
    case "bal":
    case "balance":
      db.get(msg.author.id)
        .then(async out => {
          if (out === null) {
            await db.set(msg.author.id, 20);
            console.log("set");
          }
          // infinity
          // db.set("658276923218067466", Number.MAX_VALUE);
          msg.reply(`You currently have ${out ?? 20} ${client.emojis.cache.get(emoji.misc.bible)}.`);
        });

      break;
    case "deck":
      if (args.length === 0) {
        msg.reply(Object.values(emoji).map(i => Object.values(i)).flat().join(""));
      } else if (args.length === 1){
				if (!emoji[args[0]]) { // why do == undefined casting exists
					msg.reply("Category not found")
					break;
				}
				msg.reply(Object.values(emoji[args[0]]).join(""))
      } else {
      	try {
       	  msg.reply(emoji[args[0]][args[1]]);
        } catch {
          msg.reply("Emote not found.");
				}
      }
      break;
		case "status":
      // courtesy of https://stackoverflow.com/a/54257210
      // revoked access due to nsfw abuse
      if (!msg.member.roles.cache.some(role => ["899062038918217758"].includes(role.id))) {
        msg.reply(`Command ${cmd} not found.`);
        break;
      }
      // , "899224176374710313"

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
          { name: `${prefix}markov [length]`, value: "Generate a bible verse with maximum length of `length`. (capped at/default 3000)" },
          { name: `${prefix}deck [suit [card]]`, value: "Prints all cards if no arguments; single suit if only one argument; or a specific card."},
          { name: `${prefix}balance`, value: "Shows the amount of bibles you have."},
          { name: `${prefix}blackjack amount`, value: "Plays a game of blackjack, betting `amount` bibles."},
        )
        .setTimestamp()
        .setFooter("BibleJack Bot");

      if (msg.member.roles.cache.some(role => ["899062038918217758", "899224176374710313"].includes(role.id))) {
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
});

// Login to Discord with your client's token
client.login(token);