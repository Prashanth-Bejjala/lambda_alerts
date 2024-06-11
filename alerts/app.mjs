import mysql2 from "mysql2/promise";
import AWS from "aws-sdk";

// Create a MySQL connection pool
const dbConnection = mysql2.createPool({
  host: "43.204.113.12",
  user: "vw-srv-0001",
  password: "Apple#123",
  port: 6603,
  database: "amazon_quicksight",
});

AWS.config.update({ region: "ap-south-1" });

export const lambdaHandler = async (event, context) => {
  try {
    let emailBody = "";
    const currentDate = new Date();
    const formattedCurrentDate = currentDate.toISOString().split("T")[0]; // Get current date in YYYY-MM-DD format

    const reportQuery = `SELECT * FROM humanResources WHERE date LIKE ?`;
    const likePattern = `%${formattedCurrentDate}%`;

    const [reportRows] = await dbConnection.execute(reportQuery, [likePattern]);

    // console.log([reportRows]);
    if (reportRows.length === 0) {
      emailBody += `<h1 style='background-color: #FFFF00; color: #000000; padding: 10px; margin-bottom: 10px;'>DMR for ${formattedCurrentDate} is not completed yet. </h1>`;
    } else {
      emailBody += `<h1 style='color: #2E86C1;'>DMR Report for '${formattedCurrentDate}'</h1>`;

      // Power Consumption KWH
      emailBody += "<h2 style='color: #333;'>Electricity Report</h2>";

      const totalConsumptionQueryKWH = `
      SELECT SUM(presentKwh- previousKwh) AS totalConsumptionKWH 
      FROM electricityUsage 
      WHERE date LIKE ?
    `;

      const [totalConsumptionRowsKWH] = await dbConnection.execute(
        totalConsumptionQueryKWH,
        [likePattern]
      );

      // totalConsumptionRows is an array, so we need to access the first element to get the result
      const totalConsumptionKWH =
       Math.ceil( totalConsumptionRowsKWH[0].totalConsumptionKWH);
      emailBody += `<p>Total Power Consumption in KWH : <strong>${totalConsumptionKWH}</strong></p>`;

      // Power Consumption Kvah
      const totalConsumptionQueryKvah = `
     SELECT SUM(presentKvah - previousKvah) AS totalConsumptionKvah
     FROM electricityUsage 
     WHERE date LIKE ?
   `;

      const [totalConsumptionRowsKvah] = await dbConnection.execute(
        totalConsumptionQueryKvah,
        [likePattern]
      );

      // totalConsumptionRowsKvah is an array, so we need to access the first element to get the result
      const totalConsumptionKvah =
        Math.ceil(totalConsumptionRowsKvah[0].totalConsumptionKvah);
      emailBody += `<p>Total Power Consumption in KVAH: <strong>${totalConsumptionKvah}</strong></p>`;

      // Power Factor
      emailBody +=
        "<h2 style='color:red;'>Power Factor: Acceptable Range 0.9 - 1 </h2>";

      const powerFactorQuery = `SELECT pf FROM electricityUsage WHERE date LIKE ? AND (pf < 0.9 OR pf > 1)`;

      const [powerFactorRows] = await dbConnection.execute(powerFactorQuery, [
        likePattern,
      ]);

      if (powerFactorRows.length === 0) {
        emailBody +=
          "<p style='color: green;'>Power Factor is within the acceptable range</p>";
      } else {
        emailBody +=
          "<p style='color: red;'>Power Factor is not in the normal range</p>";
      }

      // Water Usage
      emailBody += "<h2 style='color: #333;'>Water Usage</h2>";

      const totalConsumptionQueryKL = `
      SELECT SUM(finalReading - initialReading) AS totalConsumptionKL
      FROM waterUsage 
      WHERE date LIKE ?
    `;

      const [totalConsumptionRowsKL] = await dbConnection.execute(
        totalConsumptionQueryKL,
        [likePattern]
      );

      // totalConsumptionRowsKvah is an array, so we need to access the first element to get the result
      const totalConsumptionKL = Math.ceil(
        totalConsumptionRowsKL[0].totalConsumptionKL
      );
      emailBody += `<p>Total Water Consumption in KL: <strong>${totalConsumptionKL}</strong></p>`;

      // Water Status Report
      emailBody +=
        "<h3 style='color: #333;'>Water Status Report: (Hardness Acceptable Range > 1200)</h3>";
      const waterUsageQuery = `SELECT * FROM waterUsage WHERE date LIKE ? AND hardnessOfWater > 1200`;
      const [waterRows] = await dbConnection.execute(waterUsageQuery, [
        likePattern,
      ]);
      // console.log(waterRows, "waterRows");

      if (waterRows.length > 0) {
        emailBody += "<p style='color: red;'>Water hardness exceeded 1200 today and water is unusable.</p>";
      } else {
        emailBody += "<p>Water hardness is in normal range.</p>";
      }

      // STP Report
      emailBody += "<h2 style='color: #333;'>STP Report</h2>";

      // PH
      emailBody += "<h3 style='color: #333;'>PH Acceptable Range (6.5 - 8.5)</h3>";

      // 65 KLD
      emailBody += "<h3 style='color: #333;'>65 KLD STP Capacity</h3>";

      const kld65PHQuery = `
        SELECT * 
        FROM stpReport 
        WHERE stpCapacity LIKE ? 
        AND date LIKE ? 
        AND (ph < 6.5 OR ph > 8.5)
      `;

      const [kld65Rows] = await dbConnection.execute(kld65PHQuery, [
        "65KLD",
        likePattern,
      ]);

      if (kld65Rows.length > 0) {
        emailBody += `<p>PH is <strong style='color: red;'>${parseFloat(kld65Rows[0].ph)}</strong>, not between 6.5 and 8.5</p>`;
      } else {
        emailBody += "<p>PH within the range</p>";
      }

      // 90 KLD
      emailBody += "<h3 style='color: #333;'>90 KLD STP Capacity</h3>";

      const kld90PHQuery = `
        SELECT * 
        FROM stpReport 
        WHERE stpCapacity LIKE ? 
        AND date LIKE ? 
        AND (ph < 6.5 OR ph > 8.5)
      `;

      const [kld90Rows] = await dbConnection.execute(kld90PHQuery, [
        "90KLD",
        likePattern,
      ]);

      if (kld90Rows.length> 0) {
        emailBody += `<p>PH is <strong style='color: red;'>${parseFloat(kld90Rows[0].ph)}</strong>, not between 6.5 and 8.5</p>`;
      } else {
        emailBody += "<p>PH within the range</p>";
      }

      // DGB CHECK
      emailBody +=
        "<h1>Alerts for DGB Check Report</h1>";

      // DG Next B Check (250KVA)
      const dgNextBCheckQuery = `SELECT * FROM dgBCheck 
      WHERE date LIKE ? 
      AND DATEDIFF(dgNextBCheck250KVA, ?) <= 7`;

      const [dgNextBCheckRows] = await dbConnection.execute(dgNextBCheckQuery, [
        likePattern,
        formattedCurrentDate,
      ]);
      console.log(dgNextBCheckRows, "dgnmext");
      if (dgNextBCheckRows.length > 0) {
        const row = dgNextBCheckRows[0];
        const dgNextBCheck250KVA = new Date(row.dgNextBCheck250KVA);
        const formattedDGNextBCheckDate =
          dgNextBCheck250KVA.toLocaleDateString();
        emailBody += `<h2 style='color: red;'> DG Next-B Check ${
          row.dgNextBCheck250KVA === formattedCurrentDate
            ? "today"
            : "in a week"
        }, on ${formattedDGNextBCheckDate}</h2>`;
      } else {
        emailBody +=
          "<p>No alerts for  DG Next-B Check today or within a week.</p>";
      }

      // Fire Engine Next B Check (125KVA)
      const fireEngineNextBCheckQuery = `
      SELECT * FROM dgBCheck 
      WHERE date LIKE ? 
      AND DATEDIFF(fireEngineNextBCheck125KVA, ?) <= 7
    `;

      const [fireEngineNextBCheckRows] = await dbConnection.execute(
        fireEngineNextBCheckQuery,
        [likePattern, formattedCurrentDate]
      );
      // console.log(fireEngineNextBCheckRows, "fireEngineNextBCheckRows");

      if (fireEngineNextBCheckRows.length > 0) {
        const row = fireEngineNextBCheckRows[0];
        const fireEngineNextBCheck125KVA = new Date(
          row.fireEngineNextBCheck125KVA
        );
        const formattedFireEngineNextBCheckDate =
          fireEngineNextBCheck125KVA.toLocaleDateString();
        emailBody += `<h2 style='color: red;'> Fire Engine Next-B Check ${
          row.fireEngineNextBCheck125KVA === formattedCurrentDate
            ? "today"
            : "in a week"
        }, on ${formattedFireEngineNextBCheckDate}</h2>`;
      } else {
        emailBody +=
          "<p>No alerts for Fire Engine Next-B Check today or within a week.</p>";
      }

      // Log the email body for debugging
      // console.log(emailBody);

      // UPS Report
      emailBody += "<h2 style='color: #333;'>UPS Report</h2>";

      const upsReportQuery = `SELECT * FROM upsReport WHERE DATEDIFF(serviceDate, '${formattedCurrentDate}') <= 7 ORDER BY serviceDate DESC LIMIT 1`;
      const [upsReportRows] = await dbConnection.execute(upsReportQuery);
      console.log(upsReportRows);
      if (upsReportRows.length > 0) {
        const row = upsReportRows[0];
        const upsReportServiceDate = new Date(row.serviceDate);
        const formattedServiceDate = upsReportServiceDate.toLocaleDateString();
        emailBody += `<p style='color: red;'>Service for UPS ${
          upsReportServiceDate.getTime() === currentDate.getTime()
            ? "today"
            : "in a week"
        }, on ${formattedServiceDate}</p>`;
      } else {
        emailBody += "<p>No alerts for UPS service today or within a week.</p>";
      }
    }

    // Sending email using AWS SES
    const ses = new AWS.SES();
    const emailParams = {
      Destination: {
        ToAddresses: ["b.prashanth@voltuswave.com", "useruser888555@gmail.com"],
      },
      Message: {
        Body: {
          Html: {
            Charset: "UTF-8",
            Data: emailBody,
          },
        },
        Subject: {
          Charset: "UTF-8",
          Data: "DMR REPORT",
        },
      },
      Source: "b.prashanth@voltuswave.com",
    };

    await ses.sendEmail(emailParams).promise();
    console.log("Email sent successfully");

    // Sending SMS using AWS SNS
    const sns = new AWS.SNS();
    const phoneNumbers = ["+918309941106", "+919866368489","+918247236066","+919182783042","+919100234641"]; // Add more phone numbers if needed

    const smsPromises = phoneNumbers.map(async (phoneNumber) => {
      let smsParams;
      if (reportRows.length === 0) {
        smsParams = {
          Message: `DMR for ${formattedCurrentDate} not submitted yet`,
          PhoneNumber: phoneNumber,
        };
      } else {
        console.log("SMSSSSSSSSSSSSSSSSSSSSSSSS")
        smsParams = {
          Message: `DMR Submitted and check the mail for more details `,
          PhoneNumber: phoneNumber,
        };
      }

      try {
        const result = await sns.publish(smsParams).promise();
        console.log(`SMS sent successfully to ${phoneNumber}:`, result);
      } catch (error) {
        console.error(`Failed to send SMS to ${phoneNumber}:`, error);
      }
    });

    await Promise.all(smsPromises);
    console.log("SMS sent successfully to all recipients");

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Reports sent successfully via email and SMS",
      }),
    };
  } catch (error) {
    console.error("Database query or email/SMS sending failed:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
