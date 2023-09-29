const config = require('./config.json');

const BME280 = require("bme280-sensor");

const cron = require("node-schedule");
const moment = require("moment");
const fetch = require("node-fetch");

const ws = require("ws");
const express = require('express');

const sqlite = require("sqlite3");

/**
 * Initliaze the database
 */
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

/**
 * Initialize global variables
 */
let wss = null;
let http_server = null;

/**
 * Initialize the BME280 sensor (at it's default address)
 */
const bme280 = new BME280({
  i2cBusNo: 1,
  i2cAddress: 0x76,
});
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
  const server = express();

  server.use(express.static('./www'));

  server.get('/api/data/now', (req, res) => {
    readSensorData(function (data) {
      if (data == null) {
        res.status(500);
        res.json({
          success: false,
          error: "Could not read data from sensor.",
          data: null,
        });
      } else {
        res.json({
          success: true,
          error: null,
          data: {
            time: unixTime(),
            temp: round(data.temperature_C),
            humidity: round(data.humidity),
            pressure: round(data.pressure_hPa),
          },
        });
      }
    });
  });

  server.get('/api/data/longterm', async (req, res) => {
    let range = req.query.range;
    if (range == undefined || isNaN(range)) {
      range = 24;
    } else {
      range = Math.round(parseInt(range));
    }

    res.setHeader("Content-Type", "application/json");
    var data = await getLongtermData(range);
    if (data == null) {
      res.status(500);
      res.json({
        success: false,
        error: "Unable to read longterm monitoring data.",
        data: null,
      });
      return;
    }

    res.json({
      success: true,
      error: null,
      data: data 
    });
  });

  server.get('/api/data/outdoor', async (req, res) => {
    let data = await getOutdoorData();

    if (data == null) {
      res.status(500);
      res.json({
        success: false,
        error: "Unable to load data.",
        data: null,
      });
      return;
    }

    res.json({
      success: true,
      error: null,
      data,
    });
  });

  server.all('/api/*', (req, res) => {
    res.status(404);
    res.json({
      success: false,
      error: "API endpoint not found",
      data: null
    });
  });

  server.all('*', (req, res) => {
    res.redirect('/');
  });

  http_server = server.listen(65069, () => {
    console.log(`HTTP server listening on port 65069`);
  })
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

      let times = [];
      let temp = [];
      let humidity = [];
      let pressure = [];

      rows.forEach(row => {
        times.push(moment.unix(row.time).format('H:mm'));
        temp.push(row.temp);
        humidity.push(row.humidity);
        pressure.push(row.pressure);
      });

      resolve({
        times,
        temp,
        humidity,
        pressure
      });
    });
  });
}

/* OpenWeatherMap Cache */
let owm_cache = {
  expires: 0,
  data: null
};
/**
 * Gets outdoor data from OpenWeatherMap
 * @returns Array | null
 */
async function getOutdoorData() {
  console.log(owm_cache.expires);
  if (owm_cache.expires > unixTime()) {
    let data = owm_cache.data;

    data.cached = true;
    data.next_update = owm_cache.expires - unixTime();

    return data;
  }

  try {
    let data = await fetch(`https://api.openweathermap.org/data/2.5/weather?appid=${config.owm_api_key}&lat=${config.own_location.lat}&lon=${config.own_location.lon}&units=metric`);
    data = await data.json();

    if (data.cod != 200) {
      return null;
    }

    let out = {
      time: moment.unix(data.dt).format('H:mm'),
      temp: data.main.temp,
      heat_index: data.main.feels_like,
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      cloudiness: data.clouds.all,
      wind: data.wind.speed
    };

    owm_cache.expires = unixTime()+300;
    owm_cache.data = out;

    out.next_update = 300;
    out.cached = false;

    return out;
  } catch (err) {
    return null;
  }
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
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  http_server.close();
  db.close(() => process.exit(0));
}