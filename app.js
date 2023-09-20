const ws = require("ws");
const BME280 = require("bme280-sensor");
const cron = require("node-schedule");
const http = require("http");
const url = require("url");

const sqlite = require("sqlite3");
const db = new sqlite.Database('./data.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to database');

  db.exec(`CREATE TABLE IF NOT EXISTS data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time INTEGER,
    temp DOUBLE,
    humidity DOUBLE,
    pressure DOUBLE
  );`);
});

const bme280 = new BME280({
  i2cBusNo: 1,
  i2cAddress: 0x76,
});

let http_server = null;
let wss = null;

/**
 * Read the current data from the sensor
 * @param {*} callback 
 */
function readSensorData(callback) {
  bme280.readSensorData()
    .then((data) => {
      callback(data);
    })
    .catch((err) => {
      console.log(`BME280 read error: ${err}`);
      callback(null);
    });
}

/**
 * Get the logged data from database from the last N hours
 * @returns Array
 */
function getLongtermData(range) {
  let x = unixTime() - (range * 3600);

  return new Promise((resolve) => {
    db.all(`SELECT * FROM data WHERE time > ${x} ORDER BY time ASC`, (err, rows) => {
      if (err) {
        resolve(null);
      }
  
      resolve(rows);
    });
  });
}

/**
 * Log sensor data to database
 */
function logData() {
  let t = unixTime() - 259200;
  db.run("DELETE FROM data WHERE time < ?", [t]);

  readSensorData(function (data) {
    if (data == null) {
      return;
    }

    let time = unixTime();
    let temp = round(data.temperature_C);
    let humidity = round(data.humidity);
    let pressure = round(data.pressure_hPa);

    db.run("INSERT INTO data (time, temp, humidity, pressure) VALUES (?, ?, ?, ?)", [time, temp, humidity, pressure]);
  });
}

/**
 * Initialize BME280 sensor
 */
bme280.init()
  .then(() => {
    console.log("BME280 initialization succeeded");
    cron.scheduleJob("*/5 * * * *", function () {
      logData();
    });
    initHttp();
    initWS();

    setTimeout(() => {
      setInterval(() => {
        if (wss != null) {
          readSensorData(function (data) {
            if (data != null) {
              var data_out = {
                time: unixTime(),
                temp: round(data.temperature_C),
                humidity: round(data.humidity),
                pressure: round(data.pressure_hPa),
              };
              wss.clients.forEach((cl) => {
                cl.send(JSON.stringify(data_out));
              });
            }
          });
        }
      }, 2000);
    }, 1000);
  })
  .catch((err) => console.error(`BME280 initialization failed: ${err} `));

/**
 * Initialize HTTP API server
 */
function initHttp() {
  http_server = http.createServer(async (req, res) => {
    let parsed_url = url.parse(req.url, true);
    let path = parsed_url.pathname;
    let params = parsed_url.query;

    if (path == "/status") {
      res.setHeader("Content-Type", "text/plain");
      readSensorData(function (data) {
        if (data == null) {
          res.statusCode = 500;
          res.end("Sensor error");
        } else {
          res.statusCode = 200;
          res.end("ok");
        }
      });
      return;
    }

    if (path == "/data/now") {
      res.setHeader("Content-Type", "application/json");
      readSensorData(function (data) {
        if (data == null) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              success: false,
              error: "Could not read data from sensor.",
              data: null,
            })
          );
        } else {
          res.statusCode = 200;
          var data_out = {
            success: true,
            error: null,
            data: {
              time: unixTime(),
              temp: round(data.temperature_C),
              humidity: round(data.humidity),
              pressure: round(data.pressure_hPa),
            },
          };
          res.end(JSON.stringify(data_out));
        }
      });
      return;
    }

    if (path == "/data/longterm") {
      let range;
      if (isNaN(params.range)) {
        range = 24;
      } else {
        range = Math.round(parseInt(params.range));
      }

      res.setHeader("Content-Type", "application/json");
      var data = await getLongtermData(range);
      if (data == null) {
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            success: false,
            error: "Unable to read longterm monitoring data.",
            data: null,
          })
        );
      } else {
        res.end(JSON.stringify({ success: true, error: null, data: data }));
      }
      return;
    }
    res.statusCode = 400;
    res.end();
    return;
  });

  http_server.listen(65069, "127.0.0.1", () => {
    console.log(`HTTP server running at 127.0.0.1:65069`);
  });
}

/**
 * Initialize WebSocket server
 */
function initWS() {
  wss = new ws.WebSocketServer({ port: 65070 });
  wss.on("connection", function connection(ws) {
    readSensorData(function (data) {
      if (data != null) {
        var data_out = {
          time: unixTime(),
          temp: round(data.temperature_C),
          humidity: round(data.humidity),
          pressure: round(data.pressure_hPa),
        };
        ws.send(JSON.stringify(data_out));
      }
    });
  });

  console.log(`WebSocket server running at port 65070`);
}

/**
 * Helping functions
 */
function round(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function unixTime() {
  return Math.floor(new Date() / 1000);
}

/**
 * Shutdown hook
 */
process.on('SIGINT', () => {
  http_server.close();
  db.close();
});