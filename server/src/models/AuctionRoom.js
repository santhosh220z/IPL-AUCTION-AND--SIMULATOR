import mongoose from "mongoose";

const soldPlayerSchema = new mongoose.Schema(
  {
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: true
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: false }
);

const auctionRoomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },
    creatorUserId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    creatorName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40
    },
    participants: [
      {
        type: String,
        trim: true
      }
    ],
    teams: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team"
      }
    ],
    playerQueue: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Player"
      }
    ],
    currentPlayer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      default: null
    },
    currentPlayerIndex: {
      type: Number,
      default: 0,
      min: 0
    },
    highestBid: {
      type: Number,
      default: 0,
      min: 0
    },
    highestBidder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null
    },
    bidEndTime: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ["waiting", "ongoing", "completed"],
      default: "waiting"
    },
    soldPlayers: [soldPlayerSchema],
    unsoldPlayers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Player"
      }
    ]
  },
  {
    timestamps: true
  }
);

const AuctionRoom = mongoose.model("AuctionRoom", auctionRoomSchema);

export default AuctionRoom;
