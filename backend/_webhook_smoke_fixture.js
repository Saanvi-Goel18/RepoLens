// Throwaway fixture for a one-off webhook smoke test — safe to delete.
const express = require('express');
const app = express();

const AWS_SECRET_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE1234567890AB";

app.get('/users/:id', (req, res) => {
    const query = "SELECT * FROM users WHERE id = " + req.params.id;
    db.query(query, (err, result) => {
        console.log("query result", result);
        res.json(result);
    });
});

module.exports = app;
