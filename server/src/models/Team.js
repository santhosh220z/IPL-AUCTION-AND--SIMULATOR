import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40
    },
    ownerUserId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    ownerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40
    },
    color: {
      type: String,
      required: true,
      default: "#D4AF37",
      trim: true
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuctionRoom",
      required: true,
      index: true
    },
    budget: {
      type: Number,
      default: 100000000,
      min: 0
    },
    spent: {
      type: Number,
      default: 0,
      min: 0
    },
    players: [
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

teamSchema.index({ room: 1, ownerUserId: 1 }, { unique: true });

const Team = mongoose.model("Team", teamSchema);

export default Team;
