const jwt = require("jsonwebtoken");

module.exports = function auth(req, res, next) {

  const token = req.headers.authorization;

  if (!token)
    return res.sendStatus(401);

  try {
    const user = jwt.verify(token, "SECRET");

    req.user = user;

    next();
  } catch {
    res.sendStatus(403);
  }
};