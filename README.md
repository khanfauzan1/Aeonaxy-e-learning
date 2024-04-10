# Aeonaxy E-Learning API Documentation

Welcome to Aeonaxy E-Learning platform where users can register and get enrolled in any course from list of courses available to it.

Its root route is **'https://aeonaxy-e-learning.onrender.com'** 

**POST /register:** Registers a new user. If the username or email is already taken, it will return an error.

Request Body:

{
  "username": "The username of the new user.",
  "email": "The email of the new user.",
  "password": "The password of the new user."
}

Example Response: On successfull registration

{
  "message": "Registration successful. Check your email for confirmation."
}

**POST /register/superadmin:** Registers a new superadmin user. If the username or email is already taken, it will return an error.

Request Body:

{
  "username": "The username of the new user.",
  "email": "The email of the new user.",
  "password": "The password of the new user.",
  "pass": "The unique pass-key for superadmin registration"
}

Example Response: On successful registration

{
  "message": "Superadmin user registered successfully"
}

**POST /login:** Login a existing user.

Request Body:

{
  "email": "The email of the new user.",
  "password": "The password of the new user."
}

Example Response: On successful login

{

  **token,  //   token generated using jwt. This token will be used for userAuthentication**
  
   message: "user logged in"
   
}

**GET /users/:userId :** Returns the with details of user with particular userId. **Bearer token authentication is required done using authenticateUser middleware.** 

**PATCH /users/:userId :** Update the user details. **Bearer token authentication is required done using authenticateUser middleware.** 

Request Body:

{
  "email": "The new email of the existing user.",
  "username": "The username of the existing user."
}

Example Response: On successful updation

{

  message: "User profile updated successfully",
  updatedUser: result.rows[0], // updated user details
   
}

**POST /courses :** Add a new course in list of courses. **This can be done only by superadmin which is done by authenticateSuperadmin middleware.Also Bearer token authentication is required done using authenticateUser middleware.** 

Request Body:

{
  "name": "The name of the new course.",
  "description": "The description of the new course.",
  "category" : "The category of the new course, 
  "level" : "The level of the new course"
}

Example Response: On successful adding the course

{

  newCourse: result.rows[0], // new course details
   
}

**GET /courses :** get all courses details upto certain limit.

Request Body:  { category, level, sortBy, page = 1, limit = 10 } 

**GET /courses/:courseId :** get a particular course details by using courseId.

**PATCH /courses/:courseId :** update a particular course. **This can be done only by superadmin which is done by authenticateSuperadmin middleware.Also Bearer token authentication is required done using authenticate user middleware.**  Similar to adding a new course.

**DELETE /courses/:courseId :** delete a particular course. Similar to updating a course.

**POST /enrollments :** for enrolling in paricular course by the user. **Bearer token authentication is required done using authenticate user middleware**

**GET /enrollments :** getting user enrolled courses. **Bearer token authentication is required done using authenticate user middleware.**

**POST /reset-password :** for changing the password of user. **Bearer token authentication is required done using authenticate user middleware.**

**Response: A email will be sent to user email address which contains a link for changing the password.**

**PUT /reset-password/:token :** Link where user can enter their new password.

Request Body:  { password }

**POST /upload :** user can upload their profile image.**Bearer token authentication is required done using authenticate user middleware.**

User have to upload a file having .jpeg or .png extension. Uploaded image will be saved on **cloudinary.**There will imageUrl generated for that uploaded image file.




