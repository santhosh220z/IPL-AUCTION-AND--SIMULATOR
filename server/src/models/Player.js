import mongoose from "mongoose";

const playerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    role: {
      type: String,
      enum: ["batsman", "bowler", "all-rounder", "wicketkeeper"],
      required: true
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0
    },
    battingSkill: {
      type: Number,
      required: true,
      min: 1,
      max: 100
    },
    bowlingSkill: {
      type: Number,
      required: true,
      min: 1,
      max: 100
    }
  },
  {
    timestamps: true
  }
);

const Player = mongoose.model("Player", playerSchema);

export default Player;
