import { connectDatabase } from "../config/db.js";
import { env } from "../config/env.js";
import Player from "../models/Player.js";

const players = [
  { name: "Rohit Sharma", role: "batsman", basePrice: 2000000, battingSkill: 90, bowlingSkill: 20 },
  { name: "Virat Kohli", role: "batsman", basePrice: 2000000, battingSkill: 94, bowlingSkill: 18 },
  { name: "Shubman Gill", role: "batsman", basePrice: 1500000, battingSkill: 88, bowlingSkill: 22 },
  { name: "KL Rahul", role: "wicketkeeper", basePrice: 1600000, battingSkill: 86, bowlingSkill: 14 },
  { name: "Suryakumar Yadav", role: "batsman", basePrice: 1500000, battingSkill: 89, bowlingSkill: 16 },
  { name: "Rishabh Pant", role: "wicketkeeper", basePrice: 1500000, battingSkill: 84, bowlingSkill: 12 },
  { name: "Hardik Pandya", role: "all-rounder", basePrice: 1800000, battingSkill: 84, bowlingSkill: 78 },
  { name: "Ravindra Jadeja", role: "all-rounder", basePrice: 1700000, battingSkill: 80, bowlingSkill: 86 },
  { name: "Axar Patel", role: "all-rounder", basePrice: 1200000, battingSkill: 74, bowlingSkill: 82 },
  { name: "Washington Sundar", role: "all-rounder", basePrice: 1100000, battingSkill: 72, bowlingSkill: 79 },
  { name: "Jasprit Bumrah", role: "bowler", basePrice: 1700000, battingSkill: 32, bowlingSkill: 95 },
  { name: "Mohammed Shami", role: "bowler", basePrice: 1300000, battingSkill: 30, bowlingSkill: 90 },
  { name: "Mohammed Siraj", role: "bowler", basePrice: 1200000, battingSkill: 28, bowlingSkill: 88 },
  { name: "Arshdeep Singh", role: "bowler", basePrice: 900000, battingSkill: 25, bowlingSkill: 84 },
  { name: "Yuzvendra Chahal", role: "bowler", basePrice: 1100000, battingSkill: 24, bowlingSkill: 87 },
  { name: "Kuldeep Yadav", role: "bowler", basePrice: 1100000, battingSkill: 26, bowlingSkill: 86 },
  { name: "Ruturaj Gaikwad", role: "batsman", basePrice: 900000, battingSkill: 82, bowlingSkill: 18 },
  { name: "Ishan Kishan", role: "wicketkeeper", basePrice: 1200000, battingSkill: 80, bowlingSkill: 15 },
  { name: "Shreyas Iyer", role: "batsman", basePrice: 1100000, battingSkill: 81, bowlingSkill: 20 },
  { name: "Sanju Samson", role: "wicketkeeper", basePrice: 1200000, battingSkill: 82, bowlingSkill: 14 },
  { name: "Rinku Singh", role: "batsman", basePrice: 800000, battingSkill: 78, bowlingSkill: 18 },
  { name: "Tilak Varma", role: "batsman", basePrice: 700000, battingSkill: 77, bowlingSkill: 20 },
  { name: "Shardul Thakur", role: "all-rounder", basePrice: 900000, battingSkill: 66, bowlingSkill: 76 },
  { name: "Bhuvneshwar Kumar", role: "bowler", basePrice: 900000, battingSkill: 35, bowlingSkill: 83 },
  { name: "Trent Boult", role: "bowler", basePrice: 1200000, battingSkill: 28, bowlingSkill: 89 },
  { name: "Mitchell Starc", role: "bowler", basePrice: 1800000, battingSkill: 30, bowlingSkill: 93 },
  { name: "Pat Cummins", role: "all-rounder", basePrice: 1700000, battingSkill: 72, bowlingSkill: 88 },
  { name: "Glenn Maxwell", role: "all-rounder", basePrice: 1600000, battingSkill: 86, bowlingSkill: 70 },
  { name: "Andre Russell", role: "all-rounder", basePrice: 1700000, battingSkill: 88, bowlingSkill: 76 },
  { name: "Sunil Narine", role: "all-rounder", basePrice: 1400000, battingSkill: 74, bowlingSkill: 85 }
];

async function seedPlayers() {
  await connectDatabase(env.mongoUri);

  await Player.deleteMany({});
  await Player.insertMany(players);

  // eslint-disable-next-line no-console
  console.log(`Seeded ${players.length} players`);
  process.exit(0);
}

seedPlayers().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to seed players", error);
  process.exit(1);
});
