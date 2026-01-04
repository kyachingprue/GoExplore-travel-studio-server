require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT_URL || 5000;

app.use(express.json());
app.use(
  cors({
    origin: ['http://localhost:5173'],
    credentials: true,
  })
);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nhw49.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );

    const usersCollection = client.db('goExplore').collection('users');
    const packageCollection = client.db('goExplore').collection('packages');
    const myPackageCollection = client.db('goExplore').collection('myPackage');
    const bookmarkCollection = client.db('goExplore').collection('bookmark');

    // User data API
    app.get('/users/email/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }
        res.send(user);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error' });
      }
    });
    app.post('/users', async (req, res) => {
      try {
        const user = req.body;

        const existingUser = await usersCollection.findOne({
          email: user.email,
        });

        if (existingUser) {
          return res.send({ message: 'User already exists' });
        }

        const newUser = {
          ...user,
          role: 'user',
          emailVerified: false,
          createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Server error' });
      }
    });

    app.post('/users/google', async (req, res) => {
      try {
        const user = req.body;

        const existingUser = await usersCollection.findOne({
          email: user.email,
        });

        if (existingUser) {
          await usersCollection.updateOne(
            { email: user.email },
            {
              $set: {
                name: user.name,
                photoURL: user.photoURL,
                emailVerified: true,
                lastLogin: new Date(),
              },
            }
          );
          return res.send({ message: 'Google user updated' });
        }

        const newUser = {
          ...user,
          role: 'user',
          emailVerified: true,
          createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Server error' });
      }
    });

    app.patch('/users/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { coverImage, profileImage } = req.body; // <- updated keys

        const updateFields = {};
        if (coverImage) updateFields.coverImage = coverImage;
        if (profileImage) updateFields.profileImage = profileImage;

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateFields }
        );

        if (result.modifiedCount === 0)
          return res.status(400).json({ message: 'Nothing updated' });

        res.json({
          message: 'User updated successfully',
          updatedFields: updateFields,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.patch('/users/verify', async (req, res) => {
      try {
        const { email } = req.body;

        const result = await usersCollection.updateOne(
          { email },
          {
            $set: {
              emailVerified: true,
              verifiedAt: new Date(),
            },
          }
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Server error' });
      }
    });

    //Package showing API
    app.get('/packages', async (req, res) => {
      const result = await packageCollection.find().toArray();
      res.send(result);
    });
    app.get('/packages/:id', async (req, res) => {
      const id = req.params.id;
      const result = await packageCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // My Package API
    app.get('/myPackage/check', async (req, res) => {
      const { email, packageId } = req.query;

      const exists = await myPackageCollection.findOne({
        userEmail: email,
        packageId,
      });

      res.send({ exists: !!exists });
    });

    app.get('/myPackage/count/:email', async (req, res) => {
      try {
        const email = req.params.email;

        const count = await myPackageCollection.countDocuments({
          userEmail: email,
        });

        res.send({ count });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.post('/myPackage', async (req, res) => {
      const data = req.body;

      const exists = await myPackageCollection.findOne({
        userEmail: data.userEmail,
        packageId: data.packageId,
      });

      if (exists) {
        return res.status(409).send({ message: 'Already added' });
      }

      const result = await myPackageCollection.insertOne({
        ...data,
        createdAt: new Date(),
      });

      res.send(result);
    });

    //Bookmark API
    app.get('/bookmark/check', async (req, res) => {
      const { email, packageId } = req.query;

      const exists = await bookmarkCollection.findOne({
        userEmail: email,
        packageId,
      });

      res.send({ exists: !!exists });
    });
    app.post('/bookmark', async (req, res) => {
      const data = req.body;
      const exists = await bookmarkCollection.findOne({
        userEmail: data.userEmail,
        packageId: data.packageId,
      });

      if (exists) {
        return res.status(409).send({ message: 'Already bookmarked' });
      }

      const result = await bookmarkCollection.insertOne({
        ...data,
        createdAt: new Date(),
      });

      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Server side is running....');
});

app.listen(port, () => {
  console.log(`GoExplore server side running PORT:${port} `);
});
