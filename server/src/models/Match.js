import mongoose from "mongoose";

const matchSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuctionRoom",
      required: true,
      index: true
    },
    team1: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true
    },
    team2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true
    },
    stage: {
      type: String,
      enum: ["friendly", "league", "qualifier1", "eliminator", "qualifier2", "final"],
      default: "league"
    },
    status: {
      type: String,
      enum: ["scheduled", "completed"],
      default: "scheduled"
    },
    scorecard: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    result: {
      type: String,
      default: ""
    },
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null
    },
    team1Runs: {
      type: Number,
      default: 0
    },
    team1Wickets: {
      type: Number,
      default: 0
    },
    team1Overs: {
      type: String,
      default: "0.0"
    },
    team2Runs: {
      type: Number,
      default: 0
    },
    team2Wickets: {
      type: Number,
      default: 0
    },
    team2Overs: {
      type: String,
      default: "0.0"
    }
  },
  {
    timestamps: true
  }
);

const Match = mongoose.model("Match", matchSchema);

export default Match;
