const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const SSLCommerzPayment = require("sslcommerz-lts");
require("dotenv").config();

//token = 58b83570442ef3a8c21434b1bfd4368196d69c49a52394a72785a6496847bc7b7d7b80e1d2d080183a5fc7cceb661c2d6f5af471ca4cd22d3f647683f71b70dc
//Store ID = arifj638f72753f2ed
//Store Password = arifj638f72753f2ed@ssl

app.use(cors());
app.use(express.json());

//username = genius_carDB
//password = qIdFG0vv4Gol4iON

const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASSWORD;
const is_live = false; //true for live, false for sandbox

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.b8vg83y.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    const serviceCollection = client.db("geniusCar").collection("Services");
    const orderCollection = client.db("geniusCar").collection("Orders");

    function verifyjwt(req, res, next) {
      const authheaders = req.headers.authorization;
      if (!authheaders) {
        res.status(401).send({ message: "Unauthorized Access" });
      }
      const token = authheaders.split(" ")[1];

      jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET,
        function (err, decoded) {
          if (err) {
            res.status(403).send({ Message: "Unauthorized Access" });
          }
          req.decoded = decoded;
          next();
        }
      );
    }

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1hr",
      });
      res.send({ token });
    });

    app.get("/services", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    });

    app.get("/services/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const service = await serviceCollection.findOne(query);
      res.send(service);
    });

    app.post("/orders", verifyjwt, async (req, res) => {
      const order = req.body;
      // const result = await orderCollection.insertOne(order);
      // res.send(result);
      const orderedservice = await serviceCollection.findOne({
        _id: ObjectId(order.service),
      });

      const transactionID = new ObjectId().toString();
      const data = {
        total_amount: orderedservice.price,
        currency: order.currency,
        tran_id: transactionID, // use unique tran_id for each api call
        success_url: `https://react-genius-car-server.vercel.app/payment/success?transactionID=${transactionID}`,
        fail_url: "https://react-genius-car-server.vercel.app/payment/fail",
        cancel_url: "https://react-genius-car-server.vercel.app/payment/cancel",
        ipn_url: "http://localhost:3030/ipn",
        shipping_method: "Courier",
        product_name: order.servicename,
        product_category: "Electronic",
        product_profile: "general",
        cus_name: order.customer,
        cus_email: order.email,
        cus_add1: order.address,
        cus_city: "Dhaka",
        cus_state: "Dhaka",
        cus_postcode: order.postal,
        cus_country: "Bangladesh",
        cus_phone: order.phone,
        cus_fax: "01711111111",
        ship_name: "Customer Name",
        ship_add1: "Dhaka",
        ship_add2: "Dhaka",
        ship_city: "Dhaka",
        ship_state: "Dhaka",
        ship_postcode: 1000,
        ship_country: "Bangladesh",
      };
      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
      sslcz.init(data).then((apiResponse) => {
        // Redirect the user to payment gateway
        let GatewayPageURL = apiResponse.GatewayPageURL;
        orderCollection.insertOne({
          ...order,
          price: orderedservice.price,
          transactionID,
          paid: false,
        });
        res.send({ url: GatewayPageURL });
      });
    });

    //Success Api
    app.post("/payment/success", async (req, res) => {
      const { transactionID } = req.query;

      const result = await orderCollection.updateOne(
        { transactionID },
        { $set: { paid: true, paidtime: new Date() } }
      );

      if (result.modifiedCount > 0) {
        res.redirect(
          `http://localhost:3000/payment/seccess?transactionID=${transactionID}`
        );
      }
    });

    //Fail Api
    app.post("/payment/fail", async (req, res) => {
      const { transactionID } = req.query;

      const result = await orderCollection.updateOne(
        { transactionID },
        { $set: { FailTime: new Date() } }
      );

      if (result.modifiedCount > 0) {
        res.redirect(
          `http://localhost:3000/payment/fail?transactionID=${transactionID}`
        );
      }
    });

    //Cancel Api
    app.post("/payment/cancel", async (req, res) => {
      const { transactionID } = req.query;

      const result = await orderCollection.updateOne(
        { transactionID },
        { $set: { CancelTime: new Date() } }
      );

      if (result.modifiedCount > 0) {
        res.redirect(
          `http://localhost:3000/payment/cancel?transactionID=${transactionID}`
        );
      }
    });

    //Orders Api
    app.get("/orders", verifyjwt, async (req, res) => {
      const decoded = req.decoded;
      if (decoded.email !== req.query.email) {
        res.status(403).send({ Message: "Unothorized Access" });
      }
      let query = {};
      if (req.query.email) {
        query = {
          email: req.query.email,
        };
      }
      const cursor = orderCollection.find(query);
      const orders = await cursor.toArray();
      res.send(orders);
    });

    app.patch("/orders/:id", verifyjwt, async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const query = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          status: status,
        },
      };
      const result = await orderCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.delete("/orders/:id", verifyjwt, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await orderCollection.deleteOne(query);
      res.send(result);
    });
  } finally {
  }
}
run().catch((err) => console.error(err));

app.get("/", (req, res) => {
  res.send("Genius Car server is Running");
});

app.listen(port, () => {
  console.log(`Server is Running in Port : ${port}`);
});
