const Replicate = require("replicate");

module.exports = async function (req, res) {
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  const prompt = req.body.prompt || "forest elf"; // Default prompt if not provided
  const input = {
    prompt: prompt,
    cn_type1: "ImagePrompt",
    cn_type2: "ImagePrompt",
    cn_type3: "ImagePrompt",
    cn_type4: "ImagePrompt",
    sharpness: 2,
    image_seed: 50403806253646856,
    uov_method: "Disabled",
    image_number: 1,
    guidance_scale: 4,
    refiner_switch: 0.5,
    negative_prompt: "",
    style_selections: "Fooocus V2,Fooocus Enhance,Fooocus Sharp",
    uov_upscale_value: 0,
    outpaint_selections: "",
    outpaint_distance_top: 0,
    performance_selection: "Speed",
    outpaint_distance_left: 0,
    aspect_ratios_selection: "1152*896",
    outpaint_distance_right: 0,
    outpaint_distance_bottom: 0,
    inpaint_additional_prompt: ""
  };

  try {
    const output = await replicate.run(
      "konieshadow/fooocus-api:fda927242b1db6affa1ece4f54c37f19b964666bf23b0d06ae2439067cd344a4",
      { input }
    );
    res.json({
      success: true,
      image: output
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
};
