import streamlit as st

import pandas as pd

import os


import plotly.graph_objects as go

import requests

import json

import base64

from datetime import datetime



# ==========================================

# 1. 核心存储与全局初始化

# ==========================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MATCH_DB_PATH = os.path.join(BASE_DIR, 'match_master_pro_v3.csv')

PLAYER_DB_PATH = os.path.join(BASE_DIR, 'player_master_pro_v3.csv')



# API 配置 (Gemini 2.0 Flash)

API_KEY = os.getenv("GOOGLE_API_KEY")

API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={API_KEY}"



def initialize_files():

    """初始化数据库文件，确保不会因文件缺失报错"""

    if not os.path.exists(MATCH_DB_PATH):

        df = pd.DataFrame(columns=[

            "SeriesID", "Date", "Type", "Blue", "Red", "Game", 

            "Winner", "Duration", "K1", "K2", "Names", "Dmgs", "GD", "Comment"

        ])

        df.to_csv(MATCH_DB_PATH, index=False, encoding='utf-8-sig')

    

    if not os.path.exists(PLAYER_DB_PATH):

        df = pd.DataFrame(columns=["战队", "选手名", "总场次", "最后更新"])

        df.to_csv(PLAYER_DB_PATH, index=False, encoding='utf-8-sig')



def get_db(path):

    return pd.read_csv(path)



# ==========================================

# 2. 增强型 AI 视觉解析引擎

# ==========================================

def ai_vision_deep_parse(image_bytes):

    """

    通过 Vision AI 识别结算截图中的所有关键字段

    特别加强了对‘左右对位’和‘经济曲线’的坐标关联识别

    """

    try:

        encoded = base64.b64encode(image_bytes).decode('utf-8')

        prompt = """

        你是一名专业的电竞数据速记员。请分析这张英雄联盟结算截图并返回严格的 JSON。

        

        要求如下：

        1. 识别左侧蓝方战队(blue_team)和右侧红方战队(red_team)。

        2. 识别比赛时长(duration)和双方总击杀数(blue_kills, red_kills)。

        3. 选手对位伤害识别：

           - 识别左侧 5 名选手的名字和对应的伤害数值 (blue_players: [{"n":"名","d":0}])。

           - 识别右侧 5 名选手的名字和对应的伤害数值 (red_players: [{"n":"名","d":0}])。

        4. 经济曲线识别：

           - 观察 'GOLD DIFFERENCE OVER TIME' 图表。

           - 提取 0, 5, 10, 15, 20, 25, 30 分钟时的经济差值 (gold_diff_seq: [数值列表])。

           - 蓝方领先为正，红方领先为负。

        

        注意：必须只返回 JSON 内容，禁止包含任何 Markdown 格式或额外文字。

        """

        payload = {

            "contents": [{

                "parts": [

                    {"text": prompt},

                    {"inline_data": {"mime_type": "image/png", "data": encoded}}

                ]

            }]

        }

        response = requests.post(API_URL, json=payload, timeout=30)

        res_json = response.json()

        raw_text = res_json['candidates'][0]['content']['parts'][0]['text']

        return json.loads(raw_text.replace('```json', '').replace('```', '').strip())

    except Exception as e:

        st.error(f"AI 解析失败，请检查 API Key 或图片质量: {e}")

        return None



# ==========================================

# 3. Streamlit 页面配置

# ==========================================

st.set_page_config(page_title="职业电竞复盘专家系统", layout="wide", initial_sidebar_state="expanded")

initialize_files()



# Session State 状态管理
if 'ai_cache' not in st.session_state:
    st.session_state['ai_cache'] = {}
if 'form_id' not in st.session_state:
    st.session_state['form_id'] = 0
if 'query_team' not in st.session_state:
    st.session_state['query_team'] = "全部"



# ==========================================

# 4. 侧边栏：左右对位录入面板

# ==========================================

with st.sidebar:

    st.header("📸 自动录入控制台")

    

    with st.expander("第一步：上传与 AI 识别", expanded=True):

        img_file = st.file_uploader("选择结算截图", type=['png', 'jpg', 'jpeg'], key=f"up_{st.session_state['form_id']}")

        if img_file and st.button("🪄 启动全量识别", use_container_width=True):

            with st.spinner("AI 正在解析对位伤害与经济曲线..."):

                res = ai_vision_deep_parse(img_file.getvalue())

                if res:

                    st.session_state['ai_cache'] = res

                    st.session_state['form_id'] += 1  # 强制刷新表单初始值

                    st.success("识别成功！数据已对齐填充。")

                    st.rerun()



    ai = st.session_state['ai_cache']

    

    # 使用动态 form_id 确保 AI 识别后表单能立即刷新

    with st.form(f"entry_form_{st.session_state['form_id']}"):

        st.subheader("Series 赛事信息")

        entry_date = st.date_input("比赛日期", value=datetime.now())

        entry_type = st.selectbox("赛制类型", ["BO1", "BO3", "BO5"], index=1)

        

        c1, c2 = st.columns(2)

        b_team = c1.text_input("蓝方战队", value=ai.get('blue_team', ''))

        r_team = c2.text_input("红方战队", value=ai.get('red_team', ''))

        

        st.divider()

        st.subheader("Game 局内数据")

        curr_game = st.selectbox("局数", ["Game 1", "Game 2", "Game 3", "Game 4", "Game 5"])

        curr_winner = st.radio("本局胜方", [b_team, r_team] if b_team else ["待定", "待定"], horizontal=True)

        curr_dur = st.text_input("比赛时长", value=ai.get('duration', '00:00'))

        

        ck1, ck2 = st.columns(2)

        bk = ck1.number_input(f"{b_team} 总杀", value=int(ai.get('blue_kills', 0)))

        rk = ck2.number_input(f"{r_team} 总杀", value=int(ai.get('red_kills', 0)))

        

        st.markdown("**选手伤害对照录入 (蓝左 vs 红右)**")

        bp_list = ai.get('blue_players', [{"n":"","d":0}]*5)

        rp_list = ai.get('red_players', [{"n":"","d":0}]*5)

        

        all_n, all_d = [], []

        # 构建对位输入 UI

        for i in range(5):

            ec1, ec2, ec3, ec4 = st.columns([2, 1, 2, 1])

            # 蓝方

            bn = ec1.text_input(f"蓝P{i+1}", value=bp_list[i]['n'], key=f"bn_{i}_{st.session_state['form_id']}")

            bd = ec2.number_input("伤害", value=int(bp_list[i]['d']), key=f"bd_{i}_{st.session_state['form_id']}")

            # 红方

            rn = ec3.text_input(f"红P{i+1}", value=rp_list[i]['n'], key=f"rn_{i}_{st.session_state['form_id']}")

            rd = ec4.number_input("伤害 ", value=int(rp_list[i]['d']), key=f"rd_{i}_{st.session_state['form_id']}")

            all_n.extend([bn, rn])

            all_d.extend([str(bd), str(rd)])



        gd_input = st.text_input("经济差走势序列", value=",".join(map(str, ai.get('gold_diff_seq', [0]*7))))

        entry_comment = st.text_area("赛后复盘备注", placeholder="输入本局的关键点或失误分析...")



        if st.form_submit_button("🚀 保存数据并同步数据库", use_container_width=True):

            # 1. 保存/更新比赛库

            m_db = get_db(MATCH_DB_PATH)

            sid = f"{entry_date}_{b_team}_vs_{r_team}"

            new_match = {

                "SeriesID": sid, "Date": str(entry_date), "Type": entry_type,

                "Blue": b_team, "Red": r_team, "Game": curr_game, 

                "Winner": curr_winner, "Duration": curr_dur, "K1": bk, "K2": rk,

                "Names": ",".join(all_n), "Dmgs": ",".join(all_d), 

                "GD": gd_input, "Comment": entry_comment

            }

            # 覆盖同场同局数据

            if not m_db.empty:

                m_db = m_db[~((m_db['SeriesID'] == sid) & (m_db['Game'] == curr_game))]

            

            updated_m_db = pd.concat([m_db, pd.DataFrame([new_match])], ignore_index=True)

            updated_m_db.to_csv(MATCH_DB_PATH, index=False, encoding='utf-8-sig')

            

            # 2. 自动同步/更新选手库

            p_db = get_db(PLAYER_DB_PATH)

            for i, p_name in enumerate(all_n):

                if p_name:

                    p_team = b_team if i % 2 == 0 else r_team

                    if p_name in p_db['选手名'].values:

                        p_db.loc[p_db['选手名'] == p_name, '总场次'] += 1

                        p_db.loc[p_db['选手名'] == p_name, '最后更新'] = str(entry_date)

                    else:

                        new_p = pd.DataFrame([{"战队": p_team, "选手名": p_name, "总场次": 1, "最后更新": str(entry_date)}])

                        p_db = pd.concat([p_db, new_p], ignore_index=True)

            p_db.to_csv(PLAYER_DB_PATH, index=False, encoding='utf-8-sig')

            

            st.success(f"{curr_game} 数据同步成功！")

            st.rerun()



# ==========================================

# 5. 主界面：三维一体可视化展示

# ==========================================

st.title("🏟️ 英雄联盟职业数据分析系统")



t_viz, t_pdb = st.tabs(["📊 赛事复盘统计", "👥 选手资料库"])



with t_viz:

    main_m_df = get_db(MATCH_DB_PATH)

    if not main_m_df.empty:

        # 战队筛选与联动下钻

        all_teams_list = sorted(list(set(main_m_df['Blue'].tolist() + main_m_df['Red'].tolist())))

        sc1, sc2 = st.columns([4, 1])

        selected_t = sc1.selectbox("🔍 点击选择或输入战队名下钻历史记录：", ["全部"] + all_teams_list, 

                                    index=0 if st.session_state['query_team'] == "全部" else all_teams_list.index(st.session_state['query_team'])+1)

        

        if sc2.button("清除筛选", use_container_width=True):

            st.session_state['query_team'] = "全部"

            st.rerun()



        filter_df = main_m_df

        if selected_t != "全部":

            filter_df = main_m_df[(main_m_df['Blue'] == selected_t) | (main_m_df['Red'] == selected_t)]



        # 按 SeriesID 分组，展示大局

        for sid, series_data in filter_df.groupby("SeriesID", sort=False):

            info = series_data.iloc[0]

            # 计算实时大比分

            score_b = len(series_data[series_data['Winner'] == info['Blue']])

            score_r = len(series_data[series_data['Winner'] == info['Red']])

            

            with st.container(border=True):

                st.subheader(f"📅 {info['Date']} | {info['Blue']} {score_b} : {score_r} {info['Red']} ({info['Type']})")

                

                # 小局详情展示

                game_tabs = st.tabs(series_data['Game'].tolist())

                for g_idx, g_tab in enumerate(game_tabs):

                    game_row = series_data.iloc[g_idx]

                    with g_tab:

                        v_col1, v_col2 = st.columns(2)

                        

                        with v_col1:

                            # 1. 克隆官方经济曲线图

                            st.write("**经济领先曲线 (Gold Difference)**")

                            try:

                                gd_vals = [int(x) for x in str(game_row['GD']).split(',')]

                                time_axis = [0, 5, 10, 15, 20, 25, 30]

                                fig_gd = go.Figure()

                                fig_gd.add_trace(go.Scatter(

                                    x=time_axis, y=gd_vals,

                                    fill='tozeroy', 

                                    line=dict(color='#FFA500', width=4),

                                    fillcolor='rgba(255, 165, 0, 0.25)',

                                    name="经济领先"

                                ))

                                fig_gd.add_hline(y=0, line_dash="dash", line_color="#888")

                                fig_gd.update_layout(

                                    height=320, 

                                    template="plotly_dark",

                                    margin=dict(l=10, r=10, t=20, b=10),

                                    xaxis_title="分钟",

                                    yaxis_title="经济差"

                                )

                                st.plotly_chart(fig_gd, use_container_width=True)

                            except Exception:

                                st.warning("经济序列数据格式有误，无法绘图。")

                        

                        with v_col2:

                            # 2. 左右对位伤害对比图

                            st.write("**选手伤害对比 (Champion Damage Dealt)**")

                            try:

                                names_raw = str(game_row['Names']).split(',')

                                dmgs_raw = [int(x) for x in str(game_row['Dmgs']).split(',')]

                                

                                # 拆分蓝红对位

                                b_names = [names_raw[i] for i in range(0, 10, 2)]

                                r_names = [names_raw[i] for i in range(1, 10, 2)]

                                b_dmgs = [-dmgs_raw[i] for i in range(0, 10, 2)] # 蓝方取负值向左延伸

                                r_dmgs = [dmgs_raw[i] for i in range(1, 10, 2)]

                                

                                # 职位标签用于辅助视觉

                                positions = ["TOP", "JUG", "MID", "ADC", "SUP"]

                                

                                fig_dmg = go.Figure()

                                # 蓝方条形

                                fig_dmg.add_trace(go.Bar(

                                    y=positions, x=b_dmgs, orientation='h',

                                    name=info['Blue'], marker_color='#1E90FF',

                                    hovertext=b_names, text=[f"{n}: {abs(d)}" for n, d in zip(b_names, b_dmgs)],

                                    textposition='inside'

                                ))

                                # 红方条形

                                fig_dmg.add_trace(go.Bar(

                                    y=positions, x=r_dmgs, orientation='h',

                                    name=info['Red'], marker_color='#FF4500',

                                    hovertext=r_names, text=[f"{n}: {d}" for n, d in zip(r_names, r_dmgs)],

                                    textposition='inside'

                                ))

                                

                                fig_dmg.update_layout(

                                    barmode='relative', 

                                    height=320, 

                                    template="plotly_dark",

                                    margin=dict(l=10, r=10, t=20, b=10),

                                    yaxis=dict(autorange="reversed"),

                                    xaxis=dict(title="伤害差值对比")

                                )

                                st.plotly_chart(fig_dmg, use_container_width=True)

                            except Exception:

                                st.warning("选手伤害数据缺失。")

                        

                        # 底部复盘文字

                        st.markdown(f"💡 **复盘分析总结**：\n> {game_row['Comment'] if pd.notna(game_row['Comment']) else '未录入总结'}")

                        

                        if st.button("🗑️ 删除此局数据", key=f"del_{sid}_{game_row['Game']}"):

                            db_full = get_db(MATCH_DB_PATH)

                            db_full = db_full[~((db_full['SeriesID'] == sid) & (db_full['Game'] == game_row['Game']))]

                            db_full.to_csv(MATCH_DB_PATH, index=False, encoding='utf-8-sig')

                            st.rerun()



                # 战队链接快速跳转按钮

                st.divider()

                lb, lr = st.columns(2)

                if lb.button(f"🔗 查看 {info['Blue']} 全部历史比赛", key=f"link_b_{sid}"):

                    st.session_state['query_team'] = info['Blue']

                    st.rerun()

                if lr.button(f"🔗 查看 {info['Red']} 全部历史比赛", key=f"link_r_{sid}"):

                    st.session_state['query_team'] = info['Red']

                    st.rerun()

    else:

        st.info("📊 暂无比赛数据。请在左侧侧边栏上传结算截图开始录入。")



with t_pdb:

    st.header("👥 职业选手数据库中心")

    main_p_df = get_db(PLAYER_DB_PATH)

    

    # 顶部统计卡片

    if not main_p_df.empty:

        total_t = len(main_p_df['战队'].unique())

        total_p = len(main_p_df)

        c_p1, c_p2 = st.columns(2)

        c_p1.metric("已录入战队数", total_t)

        c_p2.metric("已录入选手总数", total_p)

        

        st.divider()

        st.dataframe(main_p_df.sort_values(by="总场次", ascending=False), use_container_width=True)

        

        if st.button("🧧 清空并重置选手库", help="此操作不可逆，将删除所有选手的出场统计"):

            pd.DataFrame(columns=["战队", "选手名", "总场次", "最后更新"]).to_csv(PLAYER_DB_PATH, index=False)

            st.rerun()

    else:

        st.info("尚未录入任何选手。随着比赛录入，数据库将自动同步。")