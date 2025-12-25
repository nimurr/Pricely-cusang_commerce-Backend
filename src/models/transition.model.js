const mongoose = require("mongoose");

const transitionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.SchemaTypes.ObjectId,
            ref: "User",
            required: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        status: {
            type: String,
            enum: ["pending", "active", "cancelled"],
            default: "pending",
            required: true,
        },
        type: {
            type: String,
            enum: ["month", "year"],
            required: true,
        },
        startDate: {
            type: Date,
            required: true,
        },
        expires: {
            type: Date,
            required: true,
        }
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Transition", transitionSchema);