var express = require('express')
var app = express()
var monitor = require('./monitor.js');

var port = process.env.PORT || 3000;

app.get('/', function (req, res) {
    monitor.fetchAlarmHistory().then(function (alarmHistory) {
        var alarmHistoryParagraphs = "";
        var a = 0;
        for (a = 0; a < alarmHistory.length; a++) {
            var hasState = JSON.parse(JSON.parse(JSON.stringify(alarmHistory[a])).HistoryData).newState !== undefined;
            var color = !hasState || 'OK' === JSON.parse(JSON.parse(JSON.stringify(alarmHistory[a])).HistoryData).newState.stateValue ? 'green' : 'red';
            var row = "<p style=\"color: " + color + "; padding: 10px\">" + alarmHistory[a].Timestamp.toString().replace("GMT+0000 ", "") + "    " + alarmHistory[a].HistorySummary + "</p>";
            alarmHistoryParagraphs += row;
        }

        if(alarmHistoryParagraphs.length == 0){
            alarmHistoryParagraphs += "<br></br>\n";
        }

        monitor.performHealthCheck().then(function (result) {
            var color = result[0].value.statusCode === 200 ? 'green' : 'red';
            var html = "<html>\n" +
                "<div style=\"width: auto\">" +
                "<div style=\"float: left; width: 600px\">" +

            "<div style=\"background-color: #f7f7f7; border: 1px solid #d3d3d3; border-radius: 10px; padding-left: 20px; padding-right: 20px\">\n" +
            "<p style=\"color:" + color + "\">CMS status STAGE: " + result[0].value.statusCode + "   " + result[0].value.statusMessage + "</p>\n" +
            "</div>\n" +

            "<div style=\"background-color: #f7f7f7; border: 1px solid #d3d3d3; margin-top: 10px; border-radius: 10px; padding-left: 20px\">\n" +
            alarmHistoryParagraphs +
            "</div>\n" +
            "</div>\n" +
            "<div style=\"float: left; margin-left: 10px; width: 600px\">" +
            "<div style=\"background-color: #f7f7f7; border: 1px solid #d3d3d3; border-radius: 10px; padding-left: 20px; padding-right: 20px\">\n" +
            "<p style=\"color:" + color + "\">API status STAGE: " + result[1].value.statusCode + "</p>\n" +
            "</div>\n" +
                "<div style=\"background-color: #f7f7f7; border: 1px solid #d3d3d3; margin-top: 10px; border-radius: 10px; padding-left: 20px\">\n" +
                "<br></br>\n" +
                "</div>\n" +
            "</div>\n" +
            "</div>\n" +
            "</html>";

            console.log("HTML: " + html);

            res.send(html);
        })
    }).catch(function (error) {
        console.log('Error: ' + error);
        res.send("Error: " + JSON.stringify(error));
    });


})


app.listen(port, function () {
    console.log('Started app listening on port ' + port + '!');
})
