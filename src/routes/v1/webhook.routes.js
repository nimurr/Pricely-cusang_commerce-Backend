const express = require("express");
const config = require("../../config/config");
const auth = require("../../middlewares/auth");
const { Transition } = require("../../models");
const router = express.Router();
const stripe = require("stripe")(config.stripe.secretKey);

// Create checkout session
router.post("/", auth("user"), async (req, res) => {
    try {
        const { productName, price, type } = req.body;

        if (!productName || !price) {
            return res.status(400).json({ error: "Missing productName or price" });
        }

        const transition = await Transition.create({
            userId: req.user._id,
            amount: price,
            status: "pending",
            type: type,
            startDate: new Date(),
            expires: type === "month"
                ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        });

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            metadata: {
                id: transition._id.toString(),
                userId: req.user._id.toString()
            },
            payment_method_types: ["card"],
            success_url: "http://localhost:3000/success",
            cancel_url: "http://localhost:3000/cancel",
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: { name: productName },
                        unit_amount: 299 * 100,
                        recurring: { interval: type },
                    },
                    quantity: 1,

                },
            ],
        });

        return res.status(200).json({
            sessionId: session.id,
            status: session.status,
            message: "Success",
            url: session.url
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});



// Stripe webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const whsec = config.stripe.webhookSecret;
    console.log(req.body, whsec)

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, whsec);
        console.log('Webhook event:', event);

    } catch (err) {
        console.error('Error verifying webhook signature:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }


    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const metadata = session.metadata;

        const transition = await Transition.findById(metadata.id);
        if (transition) {
            transition.status = "active";
            await transition.save();
        }

        return res.status(200).send('Success');
    } else {
        return res.status(400).send('Unhandled event type');
    }
});

module.exports = router;