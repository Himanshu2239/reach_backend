import operatorReport from "../models/operator.model.js";
import SurveyWorkLog from "../models/survey.model.js";
import SurveyOilReport from "../models/surveyOilReport.model.js";

const getAdminAllData = async (req, res) => {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Method Not Allowed" });
  }

  try {
    let { date, dredger, startDate, endDate } = req.body;
    console.log("date and dredger", date, dredger, startDate, endDate);
    const dredgerOptions = ["K7", "K9", "K14", "K15"];
    let matchFilter = {};

    if (dredger) {
      if (dredger !== "All") matchFilter.dredger = dredger;
    }

    if (!date) {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      const latestSurvey = await SurveyWorkLog.findOne({
        date: { $gte: tenDaysAgo.toISOString().split("T")[0] },
      })
        .sort({ date: -1 })
        .limit(1);

      // if (!latestSurvey) {
      //   return res.status(404).json({ success: false, message: "No data found in the last 10 days" });
      // }
      if (!latestSurvey) {
        return res.status(200).json({
          success: true,
          message: "No data found",
          dredger: dredger || "All",
          surveyProduction: 0,
          operatorProduction: 0,
          productionHours: "00:00",
          surveyProductionPerHour: "0.00",
          operatorProductionPerHour: "0.00",
          operatorOilConsumed: 0,
          monthlyData: {
            surveyProduction: 0,
            operatorProduction: 0,
            productionHours: "00:00",
            surveyProductionPerHour: "0.00",
            operatorProductionPerHour: "0.00",
            operatorOilConsumed: 0,
          },
        });
      }

      date = latestSurvey.date;
    }

    if (date && dredger) {
      matchFilter.date = date;
      if (dredger !== "All") matchFilter.dredger = dredger;
    }
    // if (startDate && endDate && dredger) {
    //   matchFilter.date = { $gte: startDate, $lte: endDate };
    //   if (dredger !== "All") matchFilter.dredger = dredger;
    // }

    console.log("mathfilter", matchFilter);

    const surveyData = await SurveyWorkLog.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$date",
          totalSurveyProduction: {
            $sum: { $multiply: ["$forward", "$width", "$depth"] },
          },
        },
      },
    ]);

    // console.log("surveyData", surveyData);

    const operatorData = await operatorReport.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$date",
          totalOperatorProduction: {
            $sum: {
              $multiply: [
                "$workLog.forward",
                "$workLog.swing",
                "$workLog.depth",
              ],
            },
          },
        },
      },
    ]);

    const productionHoursData = await operatorReport.aggregate([
      { $match: matchFilter },
      { $unwind: "$workLog.entries" },
      { $match: { "workLog.entries.workType": "Dredging" } },
      {
        $group: {
          _id: "$date",
          totalProductionMinutes: {
            $sum: { $toInt: "$workLog.entries.duration" },
          },
          // totalProductionMinutes: {
          //     $sum: {
          //       $toInt: {
          //         $replaceAll: { input: "$workLog.entries.duration", find: " min", replacement: "" }
          //       }
          //     }
          //   },
        },
      },
    ]);

    // console.log("data", operatorData, productionHoursData)
    // console.log("ProductionHr",productionHoursData[0].totalProductionMinutes)

    function convertMinutesToHHMM(minutes) {
      const hours = Math.floor(minutes / 60); // Get whole hours
      const mins = minutes % 60; // Get remaining minutes
      return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    }

    let productionHours =
      productionHoursData.length > 0
        ? productionHoursData[0].totalProductionMinutes / 60
        : 0;
    let productionInHourMinutes =
      productionHoursData.length > 0
        ? convertMinutesToHHMM(
            parseInt(productionHoursData[0].totalProductionMinutes)
          )
        : 0;
    let surveyProduction =
      surveyData.length > 0 ? surveyData[0].totalSurveyProduction : 0;
    let operatorProduction =
      operatorData.length > 0 ? operatorData[0].totalOperatorProduction : 0;
    let surveyProductionPerHour =
      productionHours > 0 ? surveyProduction / productionHours : 0;
    let operatorProductionPerHour =
      productionHours > 0 ? operatorProduction / productionHours : 0;

    const operatorOilData = await operatorReport.aggregate([
      { $match: matchFilter },
      { $unwind: "$oilReport" },
      { $match: { "oilReport.name": "H.S.D" } },
      {
        $group: {
          _id: "$date",
          totalHSDConsumed: { $sum: "$oilReport.consumed" },
        },
      },
    ]);

    // console.log("operatorOilData", operatorOilData)

    let operatorOilConsumed =
      operatorOilData.length > 0 ? operatorOilData[0].totalHSDConsumed : 0;

    // survey Oil Data

    let startOfMonth;
    let startDateForMonth;

    if (!startDate && !endDate) {
      startOfMonth = new Date(date);
      startOfMonth.setDate(1);
      startDateForMonth = startOfMonth.toISOString().split("T")[0];
    } else {
      startDateForMonth = startDate;
      date = endDate;
    }

    const matchFilterForMonthdata = {
      date: { $gte: startDateForMonth, $lte: date },
    };

    // If a dredger is selected, filter by dredger name

    if (dredger) {
      if (dredger !== "All") matchFilterForMonthdata["dredger"] = dredger;
    }

    console.log("matchFilterForMonthdata", matchFilterForMonthdata);
    // const startOfMonth = new Date(date);
    // startOfMonth.setDate(1);
    // const startDateForMonth = startOfMonth.toISOString().split("T")[0];

    const monthlyData = await operatorReport.aggregate([
      // { $match: { date: { $gte: startDateForMonth, $lte: date } } },
      { $match: matchFilterForMonthdata },
      { $unwind: "$workLog.entries" },
      { $match: { "workLog.entries.workType": "Dredging" } },
      {
        $group: {
          _id: null,
          totalProductionMinutes: {
            $sum: { $toInt: "$workLog.entries.duration" },
          },
        },
      },
    ]);

    // console.log("HourMonthdata", monthlyData)

    const monthlySurveyData = await SurveyWorkLog.aggregate([
      // { $match: { date: { $gte: startDateForMonth, $lte: date } } },
      { $match: matchFilterForMonthdata },
      {
        $group: {
          _id: null,
          totalSurveyProduction: {
            $sum: { $multiply: ["$forward", "$width", "$depth"] },
          },
        },
      },
    ]);

    // console.log("monthlySurveyData", monthlySurveyData)

    const monthlyOperatorData = await operatorReport.aggregate([
      // { $match: { date: { $gte: startDateForMonth, $lte: date } } },
      { $match: matchFilterForMonthdata },
      {
        $group: {
          _id: null,
          totalOperatorProduction: {
            $sum: {
              $multiply: [
                "$workLog.forward",
                "$workLog.swing",
                "$workLog.depth",
              ],
            },
          },
        },
      },
    ]);

    const monthlyOperatorOilData = await operatorReport.aggregate([
      // { $match: { date: { $gte: startDateForMonth, $lte: date } } },
      { $match: matchFilterForMonthdata },
      { $unwind: "$oilReport" },
      { $match: { "oilReport.name": "H.S.D" } },
      {
        $group: {
          _id: null,
          totalMonthlyHSDConsumed: { $sum: "$oilReport.consumed" },
        },
      },
    ]);

    // console.log("monthlyOperatorData", monthlyOperatorData)

    let monthlyProductionHours =
      monthlyData.length > 0 ? monthlyData[0].totalProductionMinutes / 60 : 0;
    let monthlyProductionHourMinutes =
      monthlyData.length > 0
        ? convertMinutesToHHMM(monthlyData[0].totalProductionMinutes)
        : 0;
    let monthlySurveyProduction =
      monthlySurveyData.length > 0
        ? monthlySurveyData[0].totalSurveyProduction
        : 0;
    let monthlyOperatorProduction =
      monthlyOperatorData.length > 0
        ? monthlyOperatorData[0].totalOperatorProduction
        : 0;
    let monthlySurveyProductionPerHour =
      monthlyProductionHours > 0
        ? monthlySurveyProduction / monthlyProductionHours
        : 0;
    let monthlyOperatorProductionPerHour =
      monthlyProductionHours > 0
        ? monthlyOperatorProduction / monthlyProductionHours
        : 0;
    let monthlyOperatorOilConsumed =
      monthlyOperatorOilData.length > 0
        ? monthlyOperatorOilData[0].totalMonthlyHSDConsumed
        : 0;

    res.status(200).json({
      success: true,
      date,
      dredger: dredger || "All",
      surveyProduction,
      operatorProduction,
      productionHours: productionInHourMinutes,
      surveyProductionPerHour: surveyProductionPerHour.toFixed(2),
      operatorProductionPerHour: operatorProductionPerHour.toFixed(2),
      operatorOilConsumed,
      // surveyOilConsumed,
      monthlyData: {
        surveyProduction: monthlySurveyProduction,
        operatorProduction: monthlyOperatorProduction,
        productionHours: monthlyProductionHourMinutes,
        surveyProductionPerHour: monthlySurveyProductionPerHour.toFixed(2),
        operatorProductionPerHour: monthlyOperatorProductionPerHour.toFixed(2),
        operatorOilConsumed: monthlyOperatorOilConsumed,
      },
    });
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ success: false, message: error });
  }
};

const getDredgerTotalProduction = async (req, res) => {
  try {
    const totalProduction = await SurveyWorkLog.aggregate([
      {
        $group: {
          _id: "$dredger",
          totalProduction: {
            $sum: { $multiply: ["$forward", "$width", "$depth"] },
          },
        },
      },
    ]);

    const formattedData = totalProduction.reduce((acc, dredger) => {
      acc[dredger._id] = dredger.totalProduction;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      totalProduction: formattedData,
    });
  } catch (error) {
    console.error("Error fetching total production data:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getProductionDataDykewise = async (req, res) => {
  try {
    // Aggregation pipeline for dyke-wise production calculation
    const productionData = await SurveyWorkLog.aggregate([
      {
        $group: {
          _id: "$dyke",
          totalProduction: {
            $sum: { $multiply: ["$forward", "$width", "$depth"] },
          },
        },
      },
      { $sort: { _id: 1 } }, // Sort by Dyke name
    ]);

    res.status(200).json({ success: true, data: productionData });
  } catch (error) {
    console.error("Error fetching dyke-wise production:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// const getProductionDataBlockWise = async (req, res) => {
//   try{
//     const surveyReport = await SurveyWorkLog.find({});
//     console.log("survey", surveyReport);
//     res.status(200).send(surveyReport);
//   }
//   catch(error){
//     console.log("Error to fetch block wise data", error);
//     res.status(500).json({ success: false, message: error});
//   }
// }

const getProductionDataBlockWise = async (req, res) => {
  try {
    // Aggregation pipeline for block-wise production calculation
    const productionData = await SurveyWorkLog.aggregate([
      {
        $group: {
          _id: "$block",
          totalProduction: {
            $sum: { $multiply: ["$forward", "$width", "$depth"] },
          },
        },
      },
      { $sort: { _id: 1 } }, // Sort by Block name
    ]);

    res.status(200).json({ success: true, data: productionData });
  } catch (error) {
    console.error("Error fetching block-wise production:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// const serveyOilConsumed=async(req,res)=>{
//   // input will be date (dd/mm/yyyy) utc standard
// // with given input date ,following step will be followed
// // 1- take volume from "today"  OilReportSchema ,"yesterday " OilReportSchema
// // 2- take  given "date -1 " [issued,received]  from oilReportSchema which is in reportSchema which is in operator.model.js
// // Given date consumed = Given date volume - [given date -1]  volume + Received - Issued

// }

// const serveyOilConsumed = async (req, res) => {
//   try {
//     // Expecting date in dd/mm/yyyy format in the request body
//     const { date,dredger} = req.body;
//     console.log(date);
//     if (!date) {
//       return res.status(400).json({ message: "Date is required" });
//     }

//     // Parse the input date (dd/mm/yyyy) and convert it to a Date object (UTC)
//     const [day, month, year] = date.split("-");
//     const givenDate = new Date(`${year}-${month}-${day}`).toISOString().split('T')[0];;
    
    
//     console.log(givenDate);
//     console.log(isNaN(givenDate));
//     if (isNaN(givenDate)) {
//       return res
//         .status(400)
//         .json({ message: "Invalid date format. Use yyyy-mm-dd" });
//     }

//     // Calculate yesterday's date (UTC) and format it back to dd/mm/yyyy
//     const yesterdayDate = new Date(givenDate);
//     yesterdayDate.setUTCDate(givenDate.getUTCDate() - 1);
//     const yesterdayDay = String(yesterdayDate.getUTCDate()).padStart(2, "0");
//     const yesterdayMonth = String(yesterdayDate.getUTCMonth() + 1).padStart(
//       2,
//       "0"
//     );
//     const yesterdayYear = yesterdayDate.getUTCFullYear();
//     const yesterdayDateString = `${yesterdayDay}-${yesterdayMonth}-${yesterdayYear}`;

//     // Retrieve SurveyOilReport records for the given date and yesterday
//     const surveyToday = await SurveyOilReport.findOne({ date,dredger:dredger });
//     const surveyYesterday = await SurveyOilReport.findOne({
//       date: yesterdayDateString,
//       dredger:dredger
//     });
//     console.log(surveyToday,surveyYesterday)
//     if (!surveyToday || !surveyYesterday) {
//       return res
//         .status(404)
//         .json({ message: "Survey oil report not found for one or both dates" });
//     }

//     // Retrieve operatorReport records for yesterday and sum up 'received' and 'issued' from each oilReport entry
//     const operatorReports = await operatorReport.find({
//       date: yesterdayDateString,
//       dredger:dredger
//     });
//     let totalReceived = 0;
//     let totalIssued = 0;

//     operatorReports.forEach((report) => {
//       if (Array.isArray(report.oilReport)) {
//         report.oilReport.forEach((oilRep) => {
//           totalReceived += oilRep.received || 0;
//           totalIssued += oilRep.issued || 0;
//         });
//       }
//     });

//     // Calculate the consumed oil volume:
//     // Consumed = (today totalVolume - yesterday totalVolume) + (totalReceived - totalIssued)
//     const consumed =
//       surveyToday.totalVolume -
//       surveyYesterday.totalVolume +
//       (totalReceived - totalIssued);

//     // Optionally, update the surveyToday document with the consumed value if needed
//     // surveyToday.consumed = consumed;
//     // await surveyToday.save();

//     return res.status(200).json({ consumed });
//   } catch (error) {
//     console.error("Error calculating consumed oil:", error);
//     return res
//       .status(500)
//       .json({ message: "Server error", error: error.message });
//   }
// };
// const serveyOilConsumed = async (req, res) => {
//   try {
//     // Expecting date in yyyy-mm-dd format in the request body
//     const { date, dredger } = req.body;
//     if (!date) {
//       return res.status(400).json({ message: "Date is required" });
//     }

//     // Validate date format (yyyy-mm-dd)
//     if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
//       return res
//         .status(400)
//         .json({ message: "Invalid date format. Use yyyy-mm-dd" });
//     }

//     // Convert the input date string to a Date object
//     const givenDateObj = new Date(date);
//     if (isNaN(givenDateObj.getTime())) {
//       return res.status(400).json({ message: "Invalid date provided" });
//     }

//     // Calculate yesterday's date based on the given date
//     const yesterdayObj = new Date(givenDateObj);
//     yesterdayObj.setDate(givenDateObj.getDate() - 1);
//     // Format yesterday's date as yyyy-mm-dd
//     const year = yesterdayObj.getFullYear();
//     const month = String(yesterdayObj.getMonth() + 1).padStart(2, "0");
//     const day = String(yesterdayObj.getDate()).padStart(2, "0");
//     const yesterdayDateString = `${year}-${month}-${day}`;

//     // Retrieve SurveyOilReport records for the given date and yesterday
//     const surveyToday = await SurveyOilReport.findOne({ date, dredger });
//     const surveyYesterday = await SurveyOilReport.findOne({
//       date: yesterdayDateString,
//       dredger,
//     });
//     if (!surveyToday || !surveyYesterday) {
//       return res.status(404).json({
//         message: "Survey oil report not found for one or both dates",
//       });
//     }

//     // Retrieve operatorReport records for yesterday and sum up 'received' and 'issued'
//     const operatorReports = await operatorReport.find({
//       date: yesterdayDateString,
//       dredger,
//     });
//     let totalReceived = 0;
//     let totalIssued = 0;

//     operatorReports.forEach((report) => {
//       if (Array.isArray(report.oilReport)) {
//         report.oilReport.forEach((oilRep) => {
//           totalReceived += oilRep.received || 0;
//           totalIssued += oilRep.issued || 0;
//         });
//       }
//     });


//     // Calculate the consumed oil volume:
//     // Consumed = (today totalVolume - yesterday totalVolume) + (totalReceived - totalIssued)
//     const consumed =
//       surveyToday.totalVolume -
//       surveyYesterday.totalVolume +
//       (totalReceived - totalIssued);

//     // Optionally, update the surveyToday document with the consumed value if needed
//     // surveyToday.consumed = consumed;
//     // await surveyToday.save();

//     return res.status(200).json({ consumed });
//   } catch (error) {
//     console.error("Error calculating consumed oil:", error);
//     return res
//       .status(500)
//       .json({ message: "Server error", error: error.message });
//   }
// };


const serveyOilConsumed = async (req, res) => {
  try {
   
    const { date, dredger } = req.body;
    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res
        .status(400)
        .json({ message: "Invalid date format. Use yyyy-mm-dd" });
    }

   
    const givenDateObj = new Date(date);
    if (isNaN(givenDateObj.getTime())) {
      return res.status(400).json({ message: "Invalid date provided" });
    }

    
    const yesterdayObj = new Date(givenDateObj);
    yesterdayObj.setDate(givenDateObj.getDate() - 1);


    const year = yesterdayObj.getFullYear();
    const month = String(yesterdayObj.getMonth() + 1).padStart(2, "0");
    const day = String(yesterdayObj.getDate()).padStart(2, "0");
    const yesterdayDateString = `${year}-${month}-${day}`;

    const surveyToday = await SurveyOilReport.findOne({ date, dredger });
    const surveyYesterday = await SurveyOilReport.findOne({
      date: yesterdayDateString,
      dredger,
    });
    if (!surveyToday || !surveyYesterday) {
      return res.status(404).json({
        message: "Survey oil report not found for one or both dates",
      });
    }

    const operatorReports = await operatorReport.find({
      date: yesterdayDateString,
      dredger,
    });

    let totalReceived = 0;
    let totalIssued = 0;

    operatorReports.forEach((report) => {
      if (Array.isArray(report.oilReport) && report.oilReport.length > 0) {
        // Only take the 0th element in oilReport
        totalReceived += report.oilReport[0].received || 0;
        totalIssued += report.oilReport[0].issued || 0;
      }
    });

  
    // Consumed = (today totalVolume - yesterday totalVolume) + (totalReceived - totalIssued)
    const consumed =
      surveyToday.totalVolume -
      surveyYesterday.totalVolume +
      (totalReceived - totalIssued);

    // if want, update the surveyToday document with the consumed value if needed
    // surveyToday.consumed = consumed;
    // await surveyToday.save();

    return res.status(200).json({ consumed });
  } catch (error) {
    console.error("Error calculating consumed oil:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};



// Suvey Oil report in getAdminAllData Controller

//   let todaySurveyOil, previousSurveyOil;
//   // console.log("dredger", dredger);/
//   // if (dredger === "All") {
//     todaySurveyOil = await SurveyOilReport.aggregate([
//       { $match: matchFilter },
//       { $group: { _id: null, totalVolume: { $sum: "$totalVolume" } } }
//     ]);
//     previousSurveyOil = await SurveyOilReport.aggregate([
//       { $match: matchFilter },
//       { $group: { _id: null, totalVolume: { $sum: "$totalVolume" } } },
//       { $sort: { date: -1 } },
//       { $limit: 1 }
//     ]);
//   // }

//   let surveyOilConsumed = 0;
//   if (previousSurveyOil && todaySurveyOil) {
//     surveyOilConsumed = (previousSurveyOil.totalVolume - todaySurveyOil.totalVolume);
//   }

//   // console.log("todaySurveyOil", todaySurveyOil)

//   // console.log("previousSurveyOil.totalVolume", previousSurveyOil[0].totalVolume);
//   // console.log("todaySurveyOil.totalVolume", todaySurveyOil[0].totalVolume);

//  const operatorOilReceived = await operatorReport.aggregate([
//     { $match: matchFilter },
//     { $unwind: "$oilReport" },
//     { $match: { "oilReport.name": "H.S.D" } },
//     {
//       $group: {
//         _id: "$date",
//         totalHSDReceived: { $sum: "$oilReport.received" },
//       },
//     },
//   ]);

//   let operatorOilReceivedToday = operatorOilReceived.length > 0 ? operatorOilReceived[0].totalHSDReceived : 0;

//   console.log("operatorOilReceivedToday", operatorOilReceivedToday)

//   let totalSurveyOilConsumed = surveyOilConsumed + operatorOilReceivedToday;

//   console.log("totalSurveyOilReport", totalSurveyOilConsumed)

// const surveyOilToday = await SurveyOilReport.findOne({ date, dredger});

// console.log("surveyOilToday",surveyOilToday)

// let surveyOilConsumed = 0;
// if (surveyOilToday) {
//   const surveyOilPrevious = await SurveyOilReport.findOne({
//     date: { $lt: date }, dredger
//   }).sort({ date: -1 });

//   console.log("surveyOilPrevious", surveyOilPrevious)

//   if (surveyOilPrevious) {
//     surveyOilConsumed = surveyOilPrevious.totalVolume - surveyOilToday.totalVolume;
//   } else {
//     const surveyOilLast10Days = await SurveyOilReport.findOne({
//       date: { $lt: date },
//       dredger,
//     }).sort({ date: -1 });
//     console.log("surveyOilLast10Days", surveyOilLast10Days)
//     if (surveyOilLast10Days) {
//       surveyOilConsumed = surveyOilLast10Days.totalVolume - surveyOilToday.totalVolume;
//     }
//   }
// }

export {
  getAdminAllData,
  getDredgerTotalProduction,
  getProductionDataDykewise,
  getProductionDataBlockWise,
  serveyOilConsumed,
};
