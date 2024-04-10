// Import required modules
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { Pool } = require("pg");
const nodemailer = require("nodemailer");
// Configure middleware
app.use(bodyParser.json());
app.use(cors());
/// nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "ahmaadkhan736@gmail.com",
    pass: process.env.PASS,
  },
});

////
// Configure Cloudinary
cloudinary.config({
  cloud_name: "dnqr1j5i8",
  api_key: "575374642143358",
  api_secret: "ozcbIjqgqe4BQUtXz6qUaImrZOM",
});


require("dotenv").config();

let { PGHOST, PGDATABASE, PGUSER, PGPASSWORD, SECRET_KEY } =
  process.env;

const pool = new Pool({
  host: PGHOST,
  database: PGDATABASE,
  user: PGUSER,
  password: PGPASSWORD,
  port: 5432,
  ssl: {
    rejectUnauthorized: true,
    ca: "path/to/ca.pem",
  },
  connectionString: `postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:5432/${PGDATABASE}?sslmode=require`,
});

async function getPgVersion() {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT version()");
    console.log(result.rows[0].version);
    console.log("Database connected");
    client.release();
  } catch (err) {
    console.error("Error executing query:", err);
  }
}

getPgVersion();

// // Helper function to generate JWT token
function generateToken(userId, email) {
  return jwt.sign({ userId, email }, SECRET_KEY, { expiresIn: "1h" });
}

// // Helper function to authenticate user
function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Authorization token missing" });
  }

  jwt.verify(token, SECRET_KEY, (err, decodedToken) => {
    if (err) {
      return res.status(403).json({ error: err, message: "Invalid token" });
    }
    req.userId = decodedToken.userId;
    req.email = decodedToken.email;
    next();
  });
}

// Middleware to authenticate superadmin
const authenticateSuperadmin = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { rows } = await pool.query(
      "SELECT role FROM user_roles WHERE user_id = $1",
      [userId]
    );

    console.log(rows.length);

    if (rows.length === 0) {
      return res
        .status(403)
        .json({ message: "Forbidden: Superadmin access required" });
    }

    next();
  } catch (err) {
    console.error("Error authenticating superadmin:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "user-profile-images", // Specify the folder where the images will be uploaded
    allowedFormats: ["jpg", "png"], // Specify the allowed file formats
  },
});

// Initialize multer with Cloudinary storage
const upload = multer({ storage });

// Route for file upload
app.post(
  "/upload",
  upload.single("profileImage"),
  authenticateUser,
  async (req, res) => {
    try {
      const imageUrl = req.file.path;
      const userId = req.userId;

      console.log(imageUrl);
      const updateQuery =
        "UPDATE users SET profile_image_url = $1 WHERE id = $2 RETURNING *";
      const updateValues = [imageUrl, userId];
      const result = await pool.query(updateQuery, updateValues);

      res
        .status(200)
        .json({ message: "File uploaded successfully in database!!", result });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Error uploading file" });
    }
  }
);

// // User registration
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    console.log(existingUser.rows[0]);
    if (existingUser.rows.length > 0)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *",
      [username, email, password]
    );
    console.log(result.rows);
    // Send registration confirmation email using nodemailer

    const mailOptions = {
      from: "Your App <ahmaadkhan736@gmail.com>",
      to: email,
      subject: "Registration Confirmation",
      html: `
    <h1>Welcome to Our App!</h1>
    <p>Hello ${username},</p>
    <p>Thank you for registering! Your account has been created successfully.</p>
    <p><strong>Please note:</strong> This is a no-reply email address, and any responses sent to this address will not be monitored or received. If you have any questions or concerns, please contact our support team at <a href="mailto:support@example.com">support@example.com</a>.</p>
    <p>Best regards,<br>Your App Team</p>
  `,
    };
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error(error);
        res
          .status(500)
          .json({ message: "An error occurred during registration." });
      } else {
        console.log("Email sent: " + info.response);
        res.status(200).json({
          message:
            "Registration successful. Check your email for confirmation.",
        });
      }
    });
  } catch (err) {
    console.log(err);
    if (err.constraint_name === "users_username_key")
      res.status(400).json({ message: "Username already exist" });
    else res.status(500).json({ message: "Error registering user" });
  }
});

// Route for registering superadmin users
app.post("/register/superadmin", async (req, res) => {
  const { username, email, password, passkey } = req.body;

  if (passkey !== SECRET_KEY) {
    return res
      .status(400)
      .json({ message: "Invalid passkey for superadmin registration" });
  }

  try {
    // Check if the email is already registered
    const { rows: existingUsers } = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    if (existingUsers.length > 0) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert the new user into the users table
    const { rows: newUser } = await pool.query(
      "INSERT INTO users (username,email, password) VALUES ($1, $2,$3) RETURNING id",
      [username, email, hashedPassword]
    );

    // Insert the user's role into the user_roles table
    await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [
      newUser[0].id,
      "superadmin",
    ]);

    res
      .status(201)
      .json({ message: "Superadmin user registered successfully" });
  } catch (err) {
    if (err.constraint === "users_username_key") {
      res.status(400).json({ message: "Userrname already taken" });
      console.error("Error registering superadmin user:", err);
    } else res.status(500).json({ message: "Internal server error" });
  }
});

// // User login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    // If no user is found with the provided email
    if (user.rows[0].length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Compare the provided password with the stored hashed password
    const isPasswordValid = await bcrypt.compare(
      password,
      user.rows[0].password
    );

    // If the password is invalid
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate a token for the authenticated user
    const token = generateToken(user.rows[0].id, user.rows[0].email);
    res.json({ token, message: "user logged in" });
  } catch (err) {
    console.error("Error logging in:", err);

    // Send a error message to the client
    res.status(500).json({ message: "An error occurred during login" });
  }
});

// // User profile management

app.get("/users/:userId", authenticateUser, async (req, res) => {
  const userId = req.params.userId;

  try {
    console.log(req.userId);
    const user = await pool.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);

    if (user.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(201).json({ message: user.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Error retrieving user profile" });
  }
});

app.patch("/users/:userId", authenticateUser, async (req, res) => {
  const userId = req.params.userId;
  const { username, email } = req.body;

  try {
    const user = await pool.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    const result = await pool.query(
      "UPDATE users SET username = $1,email = $2 WHERE id = $3 RETURNING *",
      [username ?? user.rows[0].username, email ?? user.rows[0].email, userId]
    );
    console.log(result.rows[0]);
    if (result.rows.length == 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "User profile updated successfully",
      updatedUser: result.rows[0],
    });
  } catch (err) {
    console.error("Error updating user profile:", err);

    if (err.constraint_name === "users_username_key")
      res.status(400).json({ message: "Username already exist" });
    else res.status(500).json({ message: "Error updating user profile" });
  }
});

// // User profile management ends here

// // Course management (CRUD operations for superadmin)

app.post(
  "/courses",
  authenticateUser,
  authenticateSuperadmin,
  async (req, res) => {
    const { name, description, category, level } = req.body;

    try {
      const newCourse = await pool.query(
        "INSERT INTO courses (name, description, category, level) VALUES ($1, $2, $3, $4) RETURNING *",
        [name, description, category, level]
      );

      res.status(201).json(newCourse);
    } catch (err) {
      res.status(500).json({ message: "Error creating course" });
    }
  }
);

// Get Courses
app.get("/courses", async (req, res) => {
  const { category, level, sortBy, page = 1, limit = 10 } = req.body;

  let query = "SELECT * FROM courses";
  const filters = [];
  const queryParams = [];

  // Apply filters
  if (category) {
    filters.push("category = $1");
    queryParams.push(category);
  }

  if (level) {
    if (!category) filters.push("level = $1");
    else filters.push("level = $2");
    queryParams.push(level);
  }

  if (filters.length > 0) {
    query += " WHERE " + filters.join(" AND ");
  }

  // Apply sorting
  if (sortBy) {
    query += ` ORDER BY ${sortBy}`;
  }

  // Apply pagination
  let offset = (page - 1) * limit;
  if (offset < 0) offset = 0;

  query += ` LIMIT $${queryParams.length + 1} OFFSET $${
    queryParams.length + 2
  }`;
  queryParams.push(limit, offset);
  console.log("query", query);
  console.log("queryparams", queryParams);
  try {
    const { rows } = await pool.query(query, queryParams);
    console.log(rows);
    res.status(200).json({ courses: rows });
  } catch (err) {
    console.error("Error fetching courses:", err);
    res.status(500).json({ error: "Error fetching courses" });
  }
});

app.get("/courses/:courseId", async (req, res) => {
  const courseId = req.params.courseId;

  try {
    const course = await pool.query("SELECT * FROM courses WHERE id = $1", [
      courseId,
    ]);

    if (course.rows.length === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    res.json(course.rows);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving course" });
  }
});

app.patch(
  "/courses/:courseId",
  authenticateUser,
  authenticateSuperadmin,
  async (req, res) => {
    const courseId = req.params.courseId;
    const { name, description, category, level } = req.body;

    try {
      const course = await pool.query("SELECT * FROM courses WHERE id = $1", [
        courseId,
      ]);
      console.log(course.rows);
      await pool.query(
        "UPDATE courses SET name = $1, description = $2, category = $3, level = $4 WHERE id = $5",
        [
          name ?? course.rows[0].name,
          description ?? course.rows[0].description,
          category ?? course.rows[0].category,
          level ?? course.rows[0].level,
          courseId
        ]
      );

      res.json({ message: "Course updated successfully" });
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: "Error updating course" });
    }
  }
);

app.delete(
  "/courses/:courseId",
  authenticateUser,
  authenticateSuperadmin,
  async (req, res) => {
    const courseId = req.params.courseId;

    try {
      const result=await pool.query('DELETE FROM courses WHERE id = $1',[courseId]);

      res.json({ message: "Course deleted successfully" });
    } catch (err) {
      res.status(500).json({ message: "Error deleting course" });
    }
  }
);

// // User enrollment
app.post("/enrollments", authenticateUser, async (req, res) => {
  const userId = req.userId;
  const { courseId } = req.body;

  try {
    const user = await pool.query('SELECT * FROM users WHERE id = $1',[userId]);

    const email = user.rows[0].email;
    if (user.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const course = await pool.query(`SELECT * FROM courses WHERE id = $1`,[courseId]);

    if (course.rows.length === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    const result =
      await pool.query(`INSERT INTO enrollment (userId, courseId) VALUES ($1, $2)`,[userId,courseId]);
    // Send course enrollment email using nodemailer

    const mailOptions = {
      from: "Your App <ahmaadkhan736@gmail.com>",
      to: email,
      subject: "Course Enrollment Confirmation",
      html: `
      <p>Dear <strong> ${user.rows[0].username}</strong>,</p>
      <p>Thank you for enrolling in our <strong>${course.rows[0].name}</strong> course! We're excited to have you on board and look forward to helping you achieve your learning goals.</p>
      <p><strong>Please note:</strong> This is a no-reply email address, and any responses sent to this address will not be monitored or received. If you have any questions or concerns, please contact our support team at <a href="mailto:support@example.com">support@example.com</a>.</p>
      <p>Best regards,<br>Your App Team</p>
  `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error(error);
        res
          .status(500)
          .json({ message: "An error occurred during enrollment." });
      } else {
        console.log("Email sent: " + info.response);
        res.status(200).json({
          message:
            "Course enrollment successful. Check your email for confirmation.",
        });
      }
    });
  } catch (err) {
    if (err.constraint_name == "enrollment_pkey")
      res
        .status(400)
        .json({ message: "You are already enrolled in this course." });
    else
      res
        .status(500)
        .json({ error: err, message: "Error enrolling in course" });
  }
});

app.get("/enrollments", authenticateUser, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(400).json({ message: "user id not found" });
  }
  console.log(userId);

  try {
    const course = await pool.query(`SELECT  courses.*
    FROM enrollment
    JOIN users ON enrollment.userId = users.id
    JOIN courses ON enrollment.courseId = courses.id
    WHERE users.id = $1`,[userId]);
    if (course.rows.length === 0) {
      return res.status(404).json({ message: "No enrolled course" });
    }

    res.json(course.rows);
  } catch (err) {
    res.status(500).json({ err, message: "Error retrieving enrolled course" });
  }
});

// Password reset
app.post("/reset-password", authenticateUser, async (req, res) => {
  const { email } = req.body;

  try {
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (user.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate and send password reset email using resend
    const resetToken = generateToken(user.rows[0].id, user.rows[0].email);
    const resetLink = `https://aeonaxy-e-learning.onrender.com/${resetToken}`;

    const mailOptions = {
      from: "Your App <ahmaadkhan736@gmail.com>",
      to: email,
      subject: "Password Reset Request",
      html: `
  <h3>Hello ${user.rows[0].username},</h3>
  <p>Click the below link to reset your password</p>
  <p>Link: ${resetLink}</p>
  `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error(error);
        res
          .status(500)
          .json({ message: "Error sending password during reset email" });
      } else {
        console.log("Email sent: " + info.response);
        res.status(200).json({
          message: "Password reset email sent",
        });
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Error resetting password" });
  }
});

app.put("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const decodedToken = jwt.verify(token, SECRET_KEY);
    const userId = decodedToken.userId;
    const email = decodedToken.email;

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [
      hashedPassword,
      userId,
    ]);

    const mailOptions = {
      from: "Your App <ahmaadkhan736@gmail.com>",
      to: email,
      subject: "Password Reset Successful",
      html: `
  <p>You have successfully changed your password!</p>
  `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error(error);
        res.status(500).json({ message: "Error resetting password" });
      } else {
        console.log("Email sent: " + info.response);
        res.status(200).json({
          message: "Password reset successfully",
        });
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Error resetting password" });
  }
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
