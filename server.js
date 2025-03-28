const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const mysql = require('mysql2');
const http = require('http'); // Add for socket.io
const { Server } = require('socket.io'); // Add socket.io
const axios = require('axios');

const app = express();
const port = 3030;

// Create HTTP server
const server = http.createServer(app);
const io = new Server(server); // Initialize socket.io

// Database connection
const db = mysql.createConnection({
  host: 'streamlittest.cluster-cxb7mqzhrxh1.us-east-1.rds.amazonaws.com',
  user: 'uptime',
  password: 'NbXpYdhj7D36uCBWaEws5f',
  database: 'uptime'
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySql: ' + err.stack);
    return;
  }
  console.log('MySql Connected...');
});

// Serve static files (HTML, CSS, JS, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected');
  
  // Send initial data when a client requests it
  socket.on('requestUpdate', () => {
    sendStatusData(socket);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Function to fetch and send status data to a specific client
function sendStatusData(socket) {
  const query = 'SHOW TABLES';
  db.query(query, (err, tables) => {
    if (err) {
      console.error('Error querying database: ' + err.stack);
      return;
    }

    const tableNames = tables.map(table => Object.values(table)[0]);
    const results = [];

    let processedTables = 0;
    tableNames.forEach((tableName) => {
      const tableQuery = `SELECT * FROM ${tableName}`;
      db.query(tableQuery, (err, tableResults) => {
        if (err) {
          console.error('Error querying table: ' + err.stack);
          processedTables++;
          return;
        }

        // Add the table name (key) to each result
        tableResults.forEach(row => {
          results.push({ key: tableName, ...row });
        });

        processedTables++;
        if (processedTables === tableNames.length) {
          socket.emit('statusUpdate', results);
        }
      });
    });
  });
}

// Function to send status data to all connected clients
function broadcastStatusData() {
  try {
    const query = 'SHOW TABLES';
    db.query(query, (err, tables) => {
      if (err) {
        console.error('Error querying database: ' + err.stack);
        return;
      }

      const tableNames = tables.map(table => Object.values(table)[0]);
      const results = [];

      let processedTables = 0;
      tableNames.forEach((tableName) => {
        const tableQuery = `SELECT * FROM ${tableName}`;
        db.query(tableQuery, (err, tableResults) => {
          if (err) {
            console.error('Error querying table: ' + err.stack);
            processedTables++;
            return;
          }

          // Add the table name (key) to each result
          tableResults.forEach(row => {
            results.push({ key: tableName, ...row });
          });

          processedTables++;
          if (processedTables === tableNames.length) {
            io.emit('statusUpdate', results);
          }
        });
      });
    });
  } catch (error) {
    console.error('Error broadcasting status data:', error);
  }
}

// Run health check function every minute
cron.schedule('* * * * *', async () => {
  try {
    const urlsConfig = path.join(__dirname, 'urls.cfg');
    const configContent = fs.readFileSync(urlsConfig, 'utf8');
    const lines = configContent.trim().split('\n');
    
    const keys = [];
    const urls = [];
    
    // Parse the config file
    lines.forEach(line => {
      const index = line.indexOf('=');
      if (index === -1) return;
      const key = line.substring(0, index);
      const url = line.substring(index + 1);
      keys.push(key);
      urls.push(url);
    });
    
    // Process each URL
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      const url = urls[index];
      let result = "failed";
      
      // Try up to 4 times
      for (let i = 0; i < 4; i++) {
        try {
          const response = await axios.get(url, { 
            validateStatus: false // Don't throw on non-2xx responses
          });
          
          const statusCode = response.status;
          if ([200, 202, 301, 302, 307].includes(statusCode)) {
            result = "success";
            break;
          }
        } catch (error) {
          console.error(`Error checking ${url}: ${error.message}`);
        }
        
        if (i < 3) { // Don't sleep after the last attempt
          await new Promise(resolve => setTimeout(resolve, 5000)); // Sleep for 5 seconds
        }
      }
      
      // Format date the same way the shell script did
      const now = new Date();
      const dateTime = now.toISOString().replace('T', ' ').substring(0, 16);
      
      console.log(`${key},${dateTime},${result}`);
      
      // Create table for the key if it doesn't exist
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS ${key} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          result VARCHAR(50) NOT NULL
        )
      `;
      
      db.query(createTableQuery, (err) => {
        if (err) {
          console.error('Error creating table: ' + err.stack);
          return;
        }

        // Insert the result into the corresponding table
        const insertQuery = `INSERT INTO ${key} (created_at, result) VALUES (?, ?)`;
        db.query(insertQuery, [dateTime, result], (err, results) => {
          if (err) {
            console.error('Error inserting into database: ' + err.stack);
            return;
          }
          console.log(`Inserted health check result into database for key: ${key}`);
          
          // After successful insert, broadcast to all clients
          broadcastStatusData();
        });
      });
    }
  } catch (error) {
    console.error(`Health check error: ${error}`);
  }
});

// Keep the /status endpoint for backward compatibility
app.get('/status', (req, res) => {
  const query = 'SHOW TABLES';
  db.query(query, (err, tables) => {
    if (err) {
      console.error('Error querying database: ' + err.stack);
      res.status(500).send('Error querying database');
      return;
    }

    const tableNames = tables.map(table => Object.values(table)[0]);
    const results = [];

    let processedTables = 0;
    tableNames.forEach((tableName) => {
      const tableQuery = `SELECT * FROM ${tableName}`;
      db.query(tableQuery, (err, tableResults) => {
        if (err) {
          console.error('Error querying table: ' + err.stack);
          processedTables++;
          return;
        }

        // Add the table name (key) to each result
        tableResults.forEach(row => {
          results.push({ key: tableName, ...row });
        });

        processedTables++;
        if (processedTables === tableNames.length) {
          res.json(results);
        }
      });
    });
  });
});

// Keep other routes
app.get('/urls', (req, res) => {
  const urlsPath = path.join(__dirname, 'urls.cfg');
  if (fs.existsSync(urlsPath)) {
    const urls = fs.readFileSync(urlsPath, 'utf8');
    res.send(urls);
  } else {
    res.status(404).send('urls.cfg not found');
  }
});

// Start the server using the HTTP server instance
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});