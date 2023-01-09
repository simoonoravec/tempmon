const ws = require("ws");
const BME280 = require("bme280-sensor");
const cron = require("node-schedule");
const fs = require("fs");
const http = require("http");

const dataFile = "./data.json";

const bme280 = new BME280({
  i2cBusNo: 1,
  i2cAddress: 0x76,
});

let wss = null;

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

function getLongtermData() {
  if (!fs.existsSync(dataFile)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(dataFile));
}

function readToFile() {
  readSensorData(function (data) {
    if (data != null) {
      var data_out = {
        time: unixTime(),
        temp: round(data.temperature_C),
        humidity: round(data.humidity),
        pressure: round(data.pressure_hPa),
      };

      if (fs.existsSync(dataFile)) {
        var json = JSON.parse(fs.readFileSync(dataFile));
        json.push(data_out);

        json = arrayCleanup(json);
        fs.writeFileSync(dataFile, JSON.stringify(json));
      } else {
        var array_out = [];
        array_out.push(data_out);
        fs.writeFileSync(dataFile, JSON.stringify(array_out));
      }
    }
  });
}

bme280.init()
  .then(() => {
    console.log("BME280 initialization succeeded");
    cron.scheduleJob("*/5 * * * *", function () {
      readToFile();
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
    }, 1000 - new Date().getMilliseconds());
  })
  .catch((err) => console.error(`BME280 initialization failed: ${err} `));

function round(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function unixTime() {
  return Math.floor(+new Date() / 1000);
}

function arrayCleanup(arr) {
  if (arr.length > 600) {
    return arr.slice(-600);
  } else {
    return arr;
  }
}

function initHttp() {
  const server = http.createServer((req, res) => {
    if (req.url == "/status") {
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

    if (req.url == "/data/now") {
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

    if (req.url == "/data/longterm") {
      res.setHeader("Content-Type", "application/json");
      var data = getLongtermData();
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

  server.listen(65069, "127.0.0.1", () => {
    console.log(`HTTP server running at 127.0.0.1:65069`);
  });
}

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
