//! A message's formatted HTML as blocks of styled text, so the native apps can draw the same
//! formatting the web shows without parsing HTML themselves.

use matrix_sdk::ruma::html::{Html, NodeData, NodeRef};
use serde::Serialize;

/// A run of text with one style
#[derive(Clone, Debug, Default, Serialize, PartialEq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RichSpan {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
    pub strike: bool,
    pub underline: bool,
    /// Inline code
    pub code: bool,
    pub link: Option<String>,
    /// A mentioned user's ID; `text` is "@name", as the plain body shows mentions
    pub mention: Option<String>,
    pub spoiler: bool,
    pub emoticon: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RichBlock {
    Paragraph {
        spans: Vec<RichSpan>,
    },
    Heading {
        /// 1 to 6
        level: u8,
        spans: Vec<RichSpan>,
    },
    Quote {
        blocks: Vec<RichBlock>,
    },
    /// A bulleted or numbered list (not `List`: Kotlin's would be shadowed)
    ItemList {
        ordered: bool,
        /// The first number of an ordered list
        start: u32,
        items: Vec<Vec<RichBlock>>,
    },
    /// A code block, its text as written
    Code {
        text: String,
    },
    Rule,
}

/// Elements that mean the message has formatting worth drawing; without them the plain body
/// (with its mentions and spoilers) shows the same
const FORMATTING: [&str; 21] = [
    "b",
    "strong",
    "i",
    "em",
    "del",
    "s",
    "strike",
    "u",
    "code",
    "pre",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "ul",
    "ol",
    "hr",
    "sup",
];

/// The blocks of a sanitised message HTML, or `None` when it has no formatting
pub fn rich_blocks(html: &str) -> Option<Vec<RichBlock>> {
    let document = Html::parse(html);
    if !document.children().any(|node| has_formatting(&node)) {
        return None;
    }
    let blocks = blocks_of(document.children());
    (!blocks.is_empty()).then_some(blocks)
}

fn name(node: &NodeRef) -> Option<String> {
    node.as_element().map(|e| e.name.local.to_string())
}

fn attr(node: &NodeRef, key: &str) -> Option<String> {
    let element = node.as_element()?;
    let attrs = element.attrs.borrow();
    attrs
        .iter()
        .find(|a| &*a.name.local == key)
        .map(|a| a.value.to_string())
}

fn has_formatting(node: &NodeRef) -> bool {
    let tag = name(node);
    if tag.as_deref().is_some_and(|n| FORMATTING.contains(&n)) {
        return true;
    }
    if tag.as_deref() == Some("img") && emoticon_url(node).is_some() {
        return true;
    }
    // A named link ("[text](url)"); mentions are links too but the plain body shows them
    if tag.as_deref() == Some("a")
        && attr(node, "href").is_some_and(|href| mentioned_user(&href).is_none())
    {
        return true;
    }
    node.children().any(|child| has_formatting(&child))
}

fn is_block(name: &str) -> bool {
    matches!(
        name,
        "p" | "div"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "blockquote"
            | "ul"
            | "ol"
            | "pre"
            | "hr"
            | "table"
            | "mx-reply"
    )
}

fn blocks_of(children: impl Iterator<Item = NodeRef>) -> Vec<RichBlock> {
    let mut blocks = Vec::new();
    let mut pending: Vec<RichSpan> = Vec::new();
    let flush = |pending: &mut Vec<RichSpan>, blocks: &mut Vec<RichBlock>| {
        let spans = trimmed(std::mem::take(pending));
        if !spans.is_empty() {
            blocks.push(RichBlock::Paragraph { spans });
        }
    };
    for node in children {
        let Some(tag) = name(&node).filter(|n| is_block(n)) else {
            inlines(&node, &RichSpan::default(), &mut pending);
            continue;
        };
        flush(&mut pending, &mut blocks);
        match tag.as_str() {
            "mx-reply" => {}
            "p" | "div" | "table" => blocks.extend(blocks_of(node.children())),
            "blockquote" => blocks.push(RichBlock::Quote {
                blocks: blocks_of(node.children()),
            }),
            "ul" | "ol" => blocks.push(RichBlock::ItemList {
                ordered: tag == "ol",
                start: attr(&node, "start")
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(1),
                items: node
                    .children()
                    .filter(|child| name(child).as_deref() == Some("li"))
                    .map(|li| blocks_of(li.children()))
                    .collect(),
            }),
            "pre" => blocks.push(RichBlock::Code {
                text: text_of(&node).trim_end_matches('\n').to_owned(),
            }),
            "hr" => blocks.push(RichBlock::Rule),
            heading => {
                let mut spans = Vec::new();
                for child in node.children() {
                    inlines(&child, &RichSpan::default(), &mut spans);
                }
                let spans = trimmed(spans);
                if !spans.is_empty() {
                    blocks.push(RichBlock::Heading {
                        level: heading[1..].parse().unwrap_or(1),
                        spans,
                    });
                }
            }
        }
    }
    flush(&mut pending, &mut blocks);
    blocks
}

/// The text of a node and its children, as written (code blocks keep their whitespace)
fn text_of(node: &NodeRef) -> String {
    match node.data() {
        NodeData::Text(text) => text.borrow().to_string(),
        _ if name(node).as_deref() == Some("br") => "\n".to_owned(),
        _ => node.children().map(|child| text_of(&child)).collect(),
    }
}

fn inlines(node: &NodeRef, style: &RichSpan, out: &mut Vec<RichSpan>) {
    if let NodeData::Text(text) = node.data() {
        // Like a browser: runs of whitespace, line breaks included, are one space
        let text = text.borrow();
        let mut collapsed = String::with_capacity(text.len());
        for (index, part) in text.split_whitespace().enumerate() {
            if index > 0 {
                collapsed.push(' ');
            }
            collapsed.push_str(part);
        }
        if text.starts_with(char::is_whitespace) && !text.trim().is_empty() {
            collapsed.insert(0, ' ');
        }
        if text.ends_with(char::is_whitespace) && !text.trim().is_empty() {
            collapsed.push(' ');
        }
        if text.trim().is_empty() && !text.is_empty() {
            collapsed = " ".to_owned();
        }
        push(out, style, collapsed);
        return;
    }
    let Some(tag) = name(node) else { return };
    let mut style = style.clone();
    match tag.as_str() {
        "br" => return push(out, &style, "\n".to_owned()),
        "img" => {
            style.emoticon = emoticon_url(node);
            let alt = attr(node, "alt").unwrap_or_default();
            let text = if style.emoticon.is_some() && alt.is_empty() {
                ":emoji:".to_owned()
            } else {
                alt
            };
            return push(out, &style, text);
        }
        "b" | "strong" => style.bold = true,
        "i" | "em" => style.italic = true,
        "del" | "s" | "strike" => style.strike = true,
        "u" => style.underline = true,
        "code" => {
            style.code = true;
            return push(out, &style, text_of(node));
        }
        "span" if attr(node, "data-mx-spoiler").is_some() => style.spoiler = true,
        "a" => {
            let href = attr(node, "href").unwrap_or_default();
            if let Some(user_id) = mentioned_user(&href) {
                let name = text_of(node).trim().to_owned();
                let label = if name.starts_with('@') {
                    name
                } else if name.is_empty() {
                    user_id.clone()
                } else {
                    format!("@{name}")
                };
                style.mention = Some(user_id);
                return push(out, &style, label);
            }
            if !href.is_empty() {
                style.link = Some(href);
            }
        }
        _ => {}
    }
    for child in node.children() {
        inlines(&child, &style, out);
    }
}

fn emoticon_url(node: &NodeRef) -> Option<String> {
    attr(node, "data-mx-emoticon")?;
    attr(node, "src").filter(|src| src.starts_with("mxc://"))
}

/// `https://matrix.to/#/@user:server` links name users
fn mentioned_user(href: &str) -> Option<String> {
    let rest = href.strip_prefix("https://matrix.to/#/")?;
    let id = rest.split(['?', '/']).next()?;
    let id = percent_decode(id);
    id.starts_with('@').then_some(id)
}

fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or("");
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| text.to_owned())
}

/// Adds text in a style, joining it to the last span when the style is the same
fn push(out: &mut Vec<RichSpan>, style: &RichSpan, text: String) {
    if text.is_empty() {
        return;
    }
    if let Some(last) = out.last_mut() {
        let same = RichSpan {
            text: String::new(),
            ..last.clone()
        } == RichSpan {
            text: String::new(),
            ..style.clone()
        };
        if same && style.mention.is_none() && style.emoticon.is_none() {
            last.text.push_str(&text);
            return;
        }
    }
    out.push(RichSpan {
        text,
        ..style.clone()
    });
}

/// Drops whitespace at a paragraph's edges and doubled spaces between runs
fn trimmed(mut spans: Vec<RichSpan>) -> Vec<RichSpan> {
    for index in 1..spans.len() {
        if spans[index - 1].text.ends_with(' ') && !spans[index].code {
            let trimmed = spans[index].text.trim_start_matches(' ').to_owned();
            spans[index].text = trimmed;
        }
    }
    if let Some(first) = spans.first_mut() {
        first.text = first.text.trim_start().to_owned();
    }
    if let Some(last) = spans.last_mut() {
        last.text = last.text.trim_end().to_owned();
    }
    spans.retain(|span| !span.text.is_empty());
    spans
}

#[cfg(test)]
mod tests {
    use super::*;

    fn span(text: &str) -> RichSpan {
        RichSpan {
            text: text.into(),
            ..Default::default()
        }
    }

    #[test]
    fn plain_html_has_no_blocks() {
        assert_eq!(rich_blocks("hello<br>there"), None);
        assert_eq!(
            rich_blocks(r#"hi <a href="https://matrix.to/#/@a:x">Ann</a>"#),
            None
        );
    }

    #[test]
    fn reads_inline_styles() {
        let blocks =
            rich_blocks("<p><strong>bold</strong> and <em>it</em> <code>x</code></p>").unwrap();
        let RichBlock::Paragraph { spans } = &blocks[0] else {
            panic!("{blocks:?}")
        };
        assert_eq!(
            spans[0],
            RichSpan {
                bold: true,
                ..span("bold")
            }
        );
        assert_eq!(spans[1], span(" and "));
        assert_eq!(
            spans[2],
            RichSpan {
                italic: true,
                ..span("it")
            }
        );
        assert_eq!(
            spans[4],
            RichSpan {
                code: true,
                ..span("x")
            }
        );
    }

    #[test]
    fn reads_blocks() {
        let html = "<h1>Title</h1>\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n<blockquote>\n<p>quoted</p>\n</blockquote>\n<pre><code>let a = 1;\n</code></pre>\n";
        let blocks = rich_blocks(html).unwrap();
        assert_eq!(
            blocks[0],
            RichBlock::Heading {
                level: 1,
                spans: vec![span("Title")]
            }
        );
        assert_eq!(
            blocks[1],
            RichBlock::ItemList {
                ordered: false,
                start: 1,
                items: vec![
                    vec![RichBlock::Paragraph {
                        spans: vec![span("one")]
                    }],
                    vec![RichBlock::Paragraph {
                        spans: vec![span("two")]
                    }],
                ]
            }
        );
        assert_eq!(
            blocks[2],
            RichBlock::Quote {
                blocks: vec![RichBlock::Paragraph {
                    spans: vec![span("quoted")]
                }]
            }
        );
        assert_eq!(
            blocks[3],
            RichBlock::Code {
                text: "let a = 1;".into()
            }
        );
    }

    #[test]
    fn named_links_count_as_formatting() {
        let blocks = rich_blocks(r#"<a href="https://a.b">smh</a>"#).unwrap();
        let RichBlock::Paragraph { spans } = &blocks[0] else {
            panic!("{blocks:?}")
        };
        assert_eq!(spans[0].text, "smh");
        assert_eq!(spans[0].link.as_deref(), Some("https://a.b"));
    }

    #[test]
    fn mentions_read_as_at_names() {
        let blocks =
            rich_blocks(r#"<strong>hey</strong> <a href="https://matrix.to/#/%40a%3Ax">Ann</a>"#)
                .unwrap();
        let RichBlock::Paragraph { spans } = &blocks[0] else {
            panic!()
        };
        assert_eq!(spans[2].text, "@Ann");
        assert_eq!(spans[2].mention.as_deref(), Some("@a:x"));
    }

    #[test]
    fn custom_emoji_keep_their_image() {
        let html = r#"hi <img data-mx-emoticon src="mxc://x/a" alt=":a:"><img data-mx-emoticon src="mxc://x/a" alt=":a:">"#;
        let blocks = rich_blocks(html).unwrap();
        let RichBlock::Paragraph { spans } = &blocks[0] else {
            panic!("{blocks:?}")
        };
        assert_eq!(spans.len(), 3);
        assert_eq!(spans[1].text, ":a:");
        assert_eq!(spans[1].emoticon.as_deref(), Some("mxc://x/a"));
        assert_eq!(spans[2].emoticon.as_deref(), Some("mxc://x/a"));
        assert_eq!(rich_blocks(r#"<img src="mxc://x/a" alt="pic">"#), None);
    }
}
