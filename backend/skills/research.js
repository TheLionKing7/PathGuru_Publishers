export async function runResearchAgent(input, project) {
  const query = [
    project.title,
    project.audience,
    project.outcome,
    "ebook guide evidence trends objections"
  ].filter(Boolean).join(" ");

  if (!process.env.TAVILY_API_KEY) {
    return fallbackResearch(input, project);
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Authorization": `Bearer ${process.env.TAVILY_API_KEY}`
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: true,
      include_raw_content: false
    })
  });

  if (!response.ok) {
    throw new Error(`Tavily research failed with ${response.status}`);
  }

  const payload = await response.json();
  return {
    summary: payload.answer || `Research gathered for ${project.title}.`,
    sources: (payload.results || []).slice(0, 5).map((result) => ({
      title: result.title,
      url: result.url,
      content: result.content
    }))
  };
}

export function fallbackResearch(input, project) {
  return {
    summary: `Internal brief for ${project.title}: focus on ${project.audience}, their desired outcome, common objections, and practical steps.`,
    sources: []
  };
}
