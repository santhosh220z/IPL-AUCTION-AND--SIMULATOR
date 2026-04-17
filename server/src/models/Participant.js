import mongoose from "mongoose";

const participantSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuctionRoom",
      required: true,
      index: true
    },
    userId: {
      type: String,
      required: true,
      trim: true
    },
    userName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true
    },
    isHost: {
      type: Boolean,
      default: false
    },
    color: {
      type: String,
      required: true,
      default: "#D4AF37",
      trim: true
    }
  },
  {
    timestamps: true
  }
);

participantSchema.index({ room: 1, userId: 1 }, { unique: true });

const Participant = mongoose.model("Participant", participantSchema);

export default Participant;
