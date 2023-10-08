//On load
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

              $("#rtd_temp").html(round(live_data.temp));
              $("#rtd_heatindex").html(round(heatIndex(live_data.temp, live_data.humidity)));
              $("#rtd_humidity").html(Math.round(live_data.humidity));
              $("#rtd_pressure").html(Math.round(live_data.pressure));
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
});

const round = (val) => (Math.round(val * 10) / 10).toFixed(1);

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

  return round(hi_c);
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
    $("#owm_temp").html(round(d.data.temp));
    $("#owm_heatindex").html(round(d.data.heat_index));
    $("#owm_humidity").html(Math.round(d.data.humidity));
    $("#owm_pressure").html(Math.round(d.data.pressure));
    $("#owm_weather_icon").attr("src", `/assets/owm_icons/${d.data.weather.icon}.png`);
    $("#owm_weather_desc").html(d.data.weather.description);

    setTimeout(updateOutdoorData, d.data.next_update * 1000);
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

//Events
$("#range").change(() => loadData($("#range").val()));