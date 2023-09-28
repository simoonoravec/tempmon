//On load
let gauges = [];
$(() => {
  $("#range").val("24");
  $("#splash").fadeIn(500, () => {
    setTimeout(() => {
      loadData("24", (res) => {
        if (res == true) {
          updateOutdoorData();
          console.log(`Connecting to wss://${location.host}/ws/live`);
          const socket = new WebSocket(`wss://${location.host}/ws/live`);

          socket.onopen = (e) => {
            $("#splash").fadeOut(1000);
            setTimeout(() => {
              $("#page").fadeIn(1000);
            }, 500);
            console.log("WebSocket connected.");
            socket.onmessage = (event) => {
              let live_data = JSON.parse(event.data);

              gauges.temp.setValueAnimated(live_data.temp.toFixed(1));
              gauges.humidity.setValueAnimated(live_data.humidity.toFixed(0));
              gauges.pressure.setValueAnimated(live_data.pressure.toFixed(0));

              $("#rtd_temp").html(live_data.temp.toFixed(2));
              $("#rtd_heatindex").html(
                heatIndex(live_data.temp, live_data.humidity)
              );
              $("#rtd_humidity").html(live_data.humidity.toFixed(0));
              $("#rtd_pressure").html(live_data.pressure.toFixed(0));
            };
          };

          let error = false;
          socket.onerror = (event) => {
            console.log("WebSocket connection error.");
            error = true;
            errorModal("Interná chyba, prosím obnovte stránku.");
          };

          socket.onclose = (event) => {
            if (error) return;
            console.log("WebSocket disconnected.");
            errorModal(
              "Spojenie bolo nečakane ukončené, prosím obnovte stránku."
            );
          };
        }
      });
    }, 500);
  });

  gauges.temp = createGauge({
    element_id: "temp_now",
    value: {
      min: 10,
      max: 40,
      current: 0,
      precision: 1,
      unit: "°C",
    },
    colors: {
      default: "#ef4655",
      low: { value: 19, color: "#33c5ff" },
      medium: { value: 24, color: "#ebbd34" },
      high: { color: "#eb4f34" },
    },
  });

  gauges.humidity = createGauge({
    element_id: "humidity_now",
    value: {
      min: 10,
      max: 100,
      current: 0,
      precision: 0,
      unit: "%",
    },
    colors: {
      default: "#ef4655",
      low: { value: 40, color: "#347aeb" },
      medium: { value: 60, color: "#3734eb" },
      high: { color: "#1c1fd4" },
    },
  });

  gauges.pressure = createGauge({
    element_id: "pressure_now",
    value: {
      min: 950,
      max: 1050,
      current: 0,
      precision: 0,
      unit: "hPa",
    },
    colors: {
      default: "#ef4655",
      low: { value: 955, color: "#94d41c" },
      medium: { value: 975, color: "#eb4f34" },
      high: { color: "#d41c35" },
    },
  });
});

const heatIndex = (temp_c, humidity) => {
  let temp_f = (temp_c * 9) / 5 + 32;

  let hi_f =
    temp_f < 80
      ? 0.5 * (temp_f + 61 + (temp_f - 68) * 1.2 + humidity * 0.094)
      : -42.379 +
        2.04901523 * temp_f +
        10.14333127 * humidity -
        0.22475541 * temp_f * humidity -
        0.00683783 * temp_f * temp_f -
        0.05481717 * humidity * humidity +
        0.00122874 * temp_f * temp_f * humidity +
        0.00085282 * temp_f * humidity * humidity -
        0.00000199 * temp_f * temp_f * humidity * humidity;
  let hi_c = ((hi_f - 32) * 5) / 9;

  return hi_c.toFixed(2);
};

const errorModal = (msg) => {
  $("#page").fadeOut(100);
  $("#modal_error_text").html(msg);
  $("#modal_error").modal({
    escapeClose: false,
    clickClose: false,
    showClose: false,
    fadeDuration: 100,
  });
};

//Data loading
const loadData = (range, callback = null) => {
  $.getJSON("/api/data/longterm?range=" + range, (d) => {
    if (d.success != true) {
      $("#splash").fadeOut(100);
      $("#page").fadeOut(100);
      console.error("Error: " + d.error);
      errorModal("Interná chyba, prosím obnovte stránku.");
      if (callback != null) callback(false);
      return;
    }
    data = d;
  }).done(() => {
    if (Object.keys(Chart.instances).length > 0) destroyCharts();
    if (typeof data != "undefined") loadCharts();
    if (callback != null) callback(true);
  });
};

const updateOutdoorData = () => {
  $.getJSON("/api/data/outdoor", (d) => {
    $("#owm_temp").html(d.data.temp.toFixed(2));
    $("#owm_heatindex").html(d.data.heat_index.toFixed(2));
    $("#owm_humidity").html(d.data.humidity.toFixed(0));
    $("#owm_pressure").html(d.data.pressure.toFixed(0));
    $("#owm_cloudiness").html(d.data.cloudiness.toFixed(0));

    setTimeout(updateOutdoorData, d.data.next_update * 1000);
  });
};

//Simplified gauge function
const createGauge = (cfg) => {
  return Gauge(document.getElementById(cfg.element_id), {
    min: cfg.value.min,
    max: cfg.value.max,
    dialStartAngle: 180,
    dialEndAngle: 0,
    value: cfg.value.current,
    viewBox: "0 0 100 57",
    label: (value) => {
      return value.toFixed(cfg.value.precision) + cfg.value.unit;
    },
    color: (value) => {
      let val_ceil = Math.ceil(value);
      if (val_ceil <= cfg.colors.low.value) {
        return cfg.colors.low.color;
      }
      if (val_ceil <= cfg.colors.medium.value) {
        return cfg.colors.medium.color;
      }
      if (val_ceil > cfg.colors.medium.value) {
        return cfg.colors.high.color;
      }
      return cfg.colors.default;
    },
  });
};

//Chart management
const loadCharts = () => {
  createChart(
    "temp",
    "Teplota (°C)",
    data.data.times,
    data.data.temp,
    "#e33e2b"
  );
  createChart(
    "humidity",
    "Vlhkosť (%)",
    data.data.times,
    data.data.humidity,
    "#4287f5"
  );
  createChart(
    "pressure",
    "Tlak (hPa)",
    data.data.times,
    data.data.pressure,
    "#3ec412"
  );
};

const destroyCharts = () => {
  Object.keys(Chart.instances).forEach((x) => {
    Chart.instances[x].destroy();
  });
};

const createChart = (el_id, name, times, data, color) => {
  return new Chart(document.getElementById(el_id), {
    type: "line",
    data: {
      labels: times,
      datasets: [
        {
          data: data,
          label: name,
          borderColor: color,
          borderWidth: 2,
          pointRadius: 0,
          type: 'line'
        },
      ],
    },
    options: {
      interaction: {
        mode: 'index',
        intersect: false,
    },
    },
  });
};

//Modals
var modal_chart = -1;
const showChartModal = (type, title, color) => {
  if (modal_chart != -1) modal_chart.destroy();
  if (window.innerWidth < 1000) {
    return;
  }

  modal_chart = createChart(
    "modal_chart",
    title,
    data.data.times,
    data.data[type],
    color
  );

  $("#modal_weather").modal({ fadeDuration: 300 });
};

//Events
$("#range").change(() => loadData($("#range").val()));

$("#temp").click(() => showChartModal("temp", "Teplota (°C)", "#e33e2b"));

$("#humidity").click(() =>
  showChartModal("humidity", "Vlhkosť (%)", "#4287f5")
);

$("#pressure").click(() => showChartModal("pressure", "Tlak (hPa)", "#3ec412"));