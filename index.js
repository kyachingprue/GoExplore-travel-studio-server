require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT_URL || 5000;


const stripe = require('stripe')(process.env.VITE_GATWAY_KEY);
app.use(express.json());
app.use(
  cors({
    origin: ['http://localhost:5173'],
    credentials: true,
  })
);
app.use(cookieParser());

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
    const experiencesCollection = client
      .db('goExplore')
      .collection('experiences');
    const reviewsCollection = client.db('goExplore').collection('reviews');
    const paymentsCollection = client.db('goExplore').collection('payments');

    //JWT Token API
    app.post('/jwt', async (req, res) => {
      const user = req.body; // { email }

      if (!user?.email) {
        return res.status(400).send({ message: 'Email required' });
      }

      const token = jwt.sign(user, process.env.JWT_SECRET_TOKEN, {
        expiresIn: '7d',
      });

      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        })
        .send({ success: true });
    });

    const verifyToken = (req, res, next) => {
      const token = req.cookies.token;

      if (!token) {
        return res.status(401).send({ message: 'Unauthorized' });
      }

      jwt.verify(token, process.env.JWT_SECRET_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'Invalid token' });
        }

        req.decoded = decoded;
        next();
      });
    };

    app.post('/logout', (req, res) => {
      res
        .clearCookie('token', {
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });

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
        const { coverImage, profileImage } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: 'Invalid user ID' });
        }

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

    app.put('/users/verify', async (req, res) => {
      try {
        const { email } = req.body;
        if (!email)
          return res.status(400).send({ message: 'Email is required' });

        const result = await usersCollection.updateOne(
          { email },
          { $set: { emailVerified: true, verifiedAt: new Date() } }
        );

        if (result.matchedCount === 0)
          return res.status(404).send({ message: 'User not found' });

        res.send({ message: 'User verified', result });
      } catch (error) {
        console.error(error);
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
    app.get('/myPackage', verifyToken, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: 'Email is required' });
      }

      const result = await myPackageCollection
        .find({ userEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.get('/myPackage/:id', async (req, res) => {
      const { id } = req.params;

      try {
        const packageData = await myPackageCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!packageData)
          return res.status(404).send({ message: 'Package not found' });

        res.send(packageData);
      } catch (error) {
        console.error(error);
        res.status(400).send({ message: 'Invalid ID' });
      }
    });

    app.get('/myPackage/check', async (req, res) => {
      const { email, packageId } = req.query;

      const exists = await myPackageCollection.findOne({
        userEmail: email,
        packageId,
      });

      res.send({ exists: !!exists });
    });

    app.get('/myPackage/count/:email', verifyToken, async (req, res) => {
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

    app.post('/myPackage', verifyToken, async (req, res) => {
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

    app.delete('/myPackage/:id', verifyToken, async (req, res) => {
      const id = req.params.id;

      const result = await myPackageCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });

    //Reviews & Ratings
    app.get('/reviews', async (req, res) => {
      try {
        const { packageId, userEmail } = req.query;

        // Build query dynamically
        const query = {};
        if (packageId) query.packageId = packageId;
        if (userEmail) query.userEmail = userEmail;

        // Fetch reviews from MongoDB
        const reviews = await reviewsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(reviews);
      } catch (error) {
        console.error('GET /reviews error:', error);
        res.status(500).send({ message: 'Failed to get reviews' });
      }
    });

    app.get('/reviews/average/:packageId', async (req, res) => {
      try {
        const { packageId } = req.params;

        const result = await reviewsCollection
          .aggregate([
            { $match: { packageId } },
            {
              $group: {
                _id: '$packageId',
                avgRating: { $avg: '$rating' },
                totalReviews: { $sum: 1 },
              },
            },
          ])
          .toArray();

        if (!result.length) {
          return res.send({ avgRating: 0, totalReviews: 0 });
        }

        res.send({
          avgRating: Number(result[0].avgRating.toFixed(1)),
          totalReviews: result[0].totalReviews,
        });
      } catch (error) {
        console.error('GET /reviews/average error:', error);
        res.status(500).send({ message: 'Failed to calculate rating' });
      }
    });

    app.post('/reviews', async (req, res) => {
      try {
        const {
          packageId,
          packageTitle,
          packageImage,
          userName,
          userEmail,
          userImage,
          rating,
          comment,
        } = req.body;

        if (
          !packageId ||
          !userName ||
          !packageImage ||
          !userEmail ||
          !userImage ||
          !comment ||
          rating < 1 ||
          rating > 5
        ) {
          return res.status(400).send({ message: 'Invalid review data' });
        }

        const reviewDoc = {
          packageId,
          packageTitle,
          packageImage,
          userName,
          userEmail,
          userImage,
          rating: Number(rating),
          comment,
          createdAt: new Date(),
        };

        const result = await reviewsCollection.insertOne(reviewDoc);

        res.send({
          success: true,
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error('POST /reviews error:', error);
        res.status(500).send({ message: 'Failed to submit review' });
      }
    });

    app.put('/reviews/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { comment, rating } = req.body;
        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { comment, rating: Number(rating) } }
        );
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to update review' });
      }
    });

    app.delete('/reviews/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await reviewsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to delete review' });
      }
    });

    //Bookmark API
    app.get('/bookmark', verifyToken, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: 'Email is required' });
      }

      const result = await bookmarkCollection
        .find({ userEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.get('/bookmark/check', verifyToken, async (req, res) => {
      const { email, packageId } = req.query;

      const exists = await bookmarkCollection.findOne({
        userEmail: email,
        packageId,
      });

      res.send({ exists: !!exists });
    });
    app.post('/bookmark', verifyToken, async (req, res) => {
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
    app.delete('/bookmark/:id', verifyToken, async (req, res) => {
      const id = req.params.id;

      const result = await bookmarkCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });

    //Payment intent
    app.get('/payments', verifyToken, async (req, res) => {
      try {
        const requestedEmail = req.query.email;
        const decodedEmail = req.decoded.email;

        // get logged-in user role
        const user = await usersCollection.findOne({ email: decodedEmail });

        if (!user) {
          return res.status(401).send({ message: 'Unauthorized' });
        }

        let query = {};

        // ✅ Admin → can see all payments
        if (user.role === 'admin') {
          query = {};
        }
        // ✅ Normal user → only own payments
        else {
          if (requestedEmail !== decodedEmail) {
            return res.status(403).send({ message: 'Forbidden access' });
          }
          query = { email: decodedEmail };
        }

        const options = { sort: { paidAt: -1 } };

        const payments = await paymentsCollection
          .find(query, options)
          .toArray();

        res.send(payments);
      } catch (error) {
        console.error('Error fetching payments history:', error);
        res.status(500).send({ message: 'Failed to fetch payments history' });
      }
    });
    
   app.post('/create-payment-intent', verifyToken, async (req, res) => {
     const { amountInCents } = req.body;

     try {
       const paymentIntent = await stripe.paymentIntents.create({
         amount: amountInCents,
         currency: 'usd',
         payment_method_types: ['card'],
       });

       res.json({ clientSecret: paymentIntent.client_secret });
     } catch (error) {
       console.error(error);
       res.status(500).json({ error: error.message });
     }
   });
    
    app.post('/payments', verifyToken, async (req, res) => {
      try {
        const { packageId, email, amount,status,paymentMethod,image,        packageName, transactionId } = req.body;
        if (!packageId || !email || !amount || !paymentMethod || !transactionId) {
          return res.status(400).send({ message: 'Missing required payment fields' });
        }
        const updateResult = await myPackageCollection.updateOne(
          {
            _id: new ObjectId(packageId)
          }, 
          {
            $set: {
              payment_status: 'paid' 
          }}
        )
        if (updateResult.modifiedCount === 0) {
          return res.status(404).send({ message: 'Package not found or already paid' });
        }
        const paymentDoc = {
          packageId,
          email,
          amount,
          image,
          status,
          packageName,
          paymentMethod,
          transactionId,
          paidAt: new Date(),
        };
        const paymentResult = await paymentsCollection.insertOne(paymentDoc);
        res.send({ message: 'Payment recorded successfully', paymentResult, updateResult, insertedId: paymentResult.insertedId });
      } catch (error) {
        console.error('Payment processing error:', error);
        res.status(500).send({ message: "Failed to process payment" });
      }
    })

    app.patch('/payments/:id', verifyToken, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      const result = await paymentsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );

      res.send(result);
    });

    //Admin Dashboard
    app.get('/users', verifyToken, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.get('/reviews/admin', verifyToken, async (req, res) => {
      try {
        const reviews = await reviewsCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json(reviews);
      } catch (err) {
        console.error(err); // <-- check what this prints
        res.status(500).json({ message: 'Failed to fetch reviews' });
      }
    });

    //Not add VerifyToken
    app.get('/experiences', async (req, res) => {
      try {
        const experiences = await experiencesCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.send(experiences);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch experiences' });
      }
    });

    //Not add VerifyToken
    app.get('/experiences/:id', async (req, res) => {
      try {
        const { id } = req.params;

        const experience = await experiencesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!experience) {
          return res.status(404).send({ message: 'Experience not found' });
        }

        res.send(experience);
      } catch (error) {
        res.status(500).send({ message: 'Failed to get experience' });
      }
    });

    app.get('/bookmarks', verifyToken, async (req, res) => {
      const result = await bookmarkCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.get('/myPackages', verifyToken, async (req, res) => {
      const purchased = await myPackageCollection.find().toArray();
      res.send(purchased);
    });

    app.post('/packages', verifyToken, async (req, res) => {
      const packageData = req.body;

      if (!packageData?.title) {
        return res.status(400).send({ message: 'Invalid package data' });
      }

      const result = await packageCollection.insertOne(packageData);
      res.send(result);
    });

    app.post('/experiences', verifyToken, async (req, res) => {
      try {
        const experience = req.body;

        if (!experience?.title || !experience?.image) {
          return res.status(400).send({ message: 'Missing required fields' });
        }

        const result = await experiencesCollection.insertOne(experience);

        res.send({
          success: true,
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).send({ message: 'Failed to add experience' });
      }
    });

    app.patch('/packages/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const result = await packageCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            title: updatedData.title,
            country: updatedData.country,
            location: updatedData.location,
            price: updatedData.price,
            duration: updatedData.duration,
            rating: updatedData.rating,
            type: updatedData.type,
            image: updatedData.image,
          },
        }
      );

      res.send(result);
    });

    app.patch('/experiences/:id', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const updatedData = { ...req.body };

        delete updatedData._id;

        const result = await experiencesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        res.send(result);
      } catch (error) {
        console.error(error); // log error for debugging
        res.status(500).send({ message: 'Failed to update experience' });
      }
    });

    app.delete('/packages/:id', verifyToken, async (req, res) => {
      const id = req.params.id;

      const result = await packageCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });

    app.patch('/users/role/:id', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const { role } = req.body;

        // Validation
        if (!role || !['user', 'admin'].includes(role)) {
          return res.status(400).send({ message: 'Invalid role value' });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role,
            updatedAt: new Date(),
          },
        };

        const result = await usersCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: 'User not found' });
        }

        res.send({
          success: true,
          message: 'User role updated successfully',
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error('Role update error:', error);
        res.status(500).send({ message: 'Failed to update user role' });
      }
    });

    app.delete('/experiences/:id', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;

        const result = await experiencesCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Failed to delete experience' });
      }
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
