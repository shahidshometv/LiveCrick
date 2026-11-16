const response = await fetch("/api/assistant", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${adminPassword}`
  },
  body: JSON.stringify({
    mode: "links",
    match: {
      title: "India vs Australia",
      series: "International Cricket",
      venue: "Mumbai",
      dateLabel: "16 November 2026"
    },
    messages: [
      {
        role: "user",
        content: "Find all free official streaming links"
      }
    ]
  })
});

const data = await response.json();

console.log(data.links);
